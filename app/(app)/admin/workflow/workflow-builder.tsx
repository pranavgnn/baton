"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleCheckBig,
  FileInput,
  Loader2,
  Mail,
  RotateCcw,
  Save,
  Send,
  UserCheck,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { hasMoves, summariseNodeChanges } from "@/lib/workflow/canvas";
import { createOutcome, emptyFormSchema, newId } from "@/lib/workflow/defaults";
import { validateGraph, type GraphIssue } from "@/lib/workflow/graph";
import {
  DEFAULT_SOURCE_HANDLE,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/lib/workflow/types";
import {
  publishWorkflow,
  revertWorkflowDraft,
  saveWorkflowDraft,
  setAcceptingApplications,
} from "./actions";
import { NODE_TYPES, type BuilderNode } from "./nodes";
import {
  NodeInspector,
  type RoleOption,
  type TemplateOption,
} from "./node-inspector";

export type WorkflowBuilderProps = {
  initialGraph: WorkflowGraph;
  initialName: string;
  initialDescription: string;
  publishedGraph: WorkflowGraph | null;
  version: number;
  acceptingApplications: boolean;
  roles: RoleOption[];
  templates: TemplateOption[];
};

/* -------------------------------------------------------------------------- */
/*  Domain <-> React Flow conversion                                           */
/* -------------------------------------------------------------------------- */

function toFlowNodes(
  nodes: WorkflowNode[],
  roles: RoleOption[],
  templates: TemplateOption[],
  errorNodeIds: Set<string>,
): BuilderNode[] {
  return nodes.map((node) => {
    const roleId =
      node.kind === "stage"
        ? node.data.roleId
        : node.kind === "email" && node.data.recipientMode === "role"
          ? node.data.recipientRoleId
          : null;

    return {
      id: node.id,
      type: node.kind,
      position: node.position,
      data: {
        payload: node.data,
        roleName: roleId
          ? (roles.find((role) => role.id === roleId)?.name ?? null)
          : null,
        templateName:
          node.kind === "email" && node.data.templateId
            ? (templates.find((t) => t.id === node.data.templateId)?.name ??
              null)
            : null,
        hasError: errorNodeIds.has(node.id),
      },
      // The submission node is the fixed entry point.
      deletable: node.kind !== "start",
    } as BuilderNode;
  });
}

function toFlowEdges(edges: WorkflowEdge[], nodes: WorkflowNode[]): Edge[] {
  return edges.map((edge) => {
    const source = nodes.find((node) => node.id === edge.source);
    const outcome =
      source?.kind === "stage"
        ? source.data.outcomes.find((o) => o.id === edge.sourceHandle)
        : undefined;

    return {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: "in",
      type: "smoothstep",
      animated: source?.kind === "email",
      label: outcome?.label,
      labelShowBg: true,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Builder                                                                    */
/* -------------------------------------------------------------------------- */

export function WorkflowBuilder(props: WorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowCanvas({
  initialGraph,
  initialName,
  initialDescription,
  publishedGraph,
  version,
  acceptingApplications,
  roles,
  templates,
}: WorkflowBuilderProps) {
  const { screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [graph, setGraph] = useState<WorkflowGraph>(initialGraph);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(acceptingApplications);
  const [publishedVersion, setPublishedVersion] = useState(version);
  const [savedGraph, setSavedGraph] = useState<WorkflowGraph>(initialGraph);
  /**
   * Positions of nodes the user is dragging right now.
   *
   * React Flow emits a position change on every animation frame. Writing those
   * into `graph` re-ran validation and rebuilt every node object mid-drag,
   * which made the whole canvas flicker and blink out. Live positions are held
   * here instead and folded into the graph once the pointer is released.
   */
  const [dragPositions, setDragPositions] = useState<
    Record<string, XYPosition>
  >({});
  const [savedPublished, setSavedPublished] = useState<WorkflowGraph | null>(
    publishedGraph,
  );

  const [isSaving, startSave] = useTransition();
  const [isPublishing, startPublish] = useTransition();
  const [isReverting, startRevert] = useTransition();

  const issues = useMemo(
    () =>
      validateGraph(graph, {
        roleIds: roles.map((role) => role.id),
        templateIds: templates.map((template) => template.id),
      }),
    [graph, roles, templates],
  );

  const { errors, warnings } = useMemo(
    () => ({
      errors: issues.filter((issue) => issue.severity === "error"),
      warnings: issues.filter((issue) => issue.severity === "warning"),
    }),
    [issues],
  );

  const errorNodeIds = useMemo(
    () =>
      new Set(
        errors
          .map((issue) => issue.nodeId)
          .filter((id): id is string => Boolean(id)),
      ),
    [errors],
  );

  const dirty = useMemo(
    () =>
      JSON.stringify(graph) !== JSON.stringify(savedGraph) ||
      name !== initialName ||
      description !== initialDescription,
    [graph, savedGraph, name, description, initialName, initialDescription],
  );

  const unpublished = useMemo(
    () => JSON.stringify(graph) !== JSON.stringify(savedPublished),
    [graph, savedPublished],
  );

  const flowNodes = useMemo(
    () => toFlowNodes(graph.nodes, roles, templates, errorNodeIds),
    [graph.nodes, roles, templates, errorNodeIds],
  );
  const flowEdges = useMemo(
    () => toFlowEdges(graph.edges, graph.nodes),
    [graph.edges, graph.nodes],
  );

  /**
   * Nodes as the canvas should draw them right now: the memoised nodes above
   * with any in-flight drag position laid over the top. Overlaying keeps each
   * node's `data` object identical while it moves, so the memoised node
   * components never re-render during a drag.
   */
  const canvasNodes = useMemo(
    () =>
      Object.keys(dragPositions).length === 0
        ? flowNodes
        : flowNodes.map((node) => {
            const position = dragPositions[node.id];
            return position ? { ...node, position } : node;
          }),
    [flowNodes, dragPositions],
  );

  const selectedNode =
    graph.nodes.find((node) => node.id === selectedId) ?? null;

  /* -- Graph mutations ---------------------------------------------------- */

  /**
   * React Flow emits a change for every measurement and selection tick. Only
   * moves and removals belong in the domain graph - reacting to the rest would
   * hand back a fresh object on every frame and re-render forever.
   */
  const onNodesChange = useCallback((changes: NodeChange<BuilderNode>[]) => {
    const { moves, removals, settled } = summariseNodeChanges(changes);
    const moved = hasMoves({ moves, removals, settled });
    const removed = new Set(removals);

    if (!moved && removed.size === 0) return;

    if (moved && !settled) {
      // Still dragging: keep the movement out of the domain graph.
      setDragPositions((current) => ({ ...current, ...moves }));
    }

    if (!settled && removed.size === 0) return;

    if (settled) setDragPositions({});

    setGraph((current) => {
      const nodes = current.nodes
        .filter((node) => !removed.has(node.id))
        .map((node) => {
          const position = moves[node.id];
          return position ? { ...node, position } : node;
        });

      if (removed.size === 0) return { ...current, nodes };

      // Dropping a node must drop the connections that referenced it.
      return {
        nodes,
        edges: current.edges.filter(
          (edge) => !removed.has(edge.source) && !removed.has(edge.target),
        ),
      };
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removals = new Set(
      changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id),
    );
    if (removals.size === 0) return;

    setGraph((current) => ({
      ...current,
      edges: current.edges.filter((edge) => !removals.has(edge.id)),
    }));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setGraph((current) => {
      const handle = connection.sourceHandle ?? DEFAULT_SOURCE_HANDLE;
      const target = current.nodes.find(
        (node) => node.id === connection.target,
      );
      if (!target) return current;

      /**
       * A handle may fan out to any number of email nodes, but only one step
       * may carry the application forward - so wiring up a new continuation
       * replaces the previous one, while email branches simply accumulate.
       */
      const keep = current.edges.filter((edge) => {
        if (edge.source !== connection.source) return true;
        if (edge.sourceHandle !== handle) return true;
        // Never leave a duplicate of the edge being made.
        if (edge.target === connection.target) return false;
        if (target.kind === "email") return true;
        const existing = current.nodes.find((node) => node.id === edge.target);
        return existing?.kind === "email";
      });

      const edges = addEdge(
        { ...connection, sourceHandle: handle, id: newId("edge") },
        toFlowEdges(keep, current.nodes),
      );

      return {
        ...current,
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          sourceHandle: edge.sourceHandle ?? DEFAULT_SOURCE_HANDLE,
          target: edge.target,
        })),
      };
    });
  }, []);

  const updateNodeData = useCallback(
    (nodeId: string, data: WorkflowNode["data"]) => {
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId ? ({ ...node, data } as WorkflowNode) : node,
        ),
      }));
    },
    [],
  );

  const deleteNode = useCallback((nodeId: string) => {
    setGraph((current) => ({
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      edges: current.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    }));
    setSelectedId(null);
  }, []);

  const addNode = useCallback(
    (kind: "stage" | "email" | "end") => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      const position = bounds
        ? screenToFlowPosition({
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
          })
        : { x: 0, y: 0 };

      const id = newId(`node_${kind}`);
      const node: WorkflowNode =
        kind === "stage"
          ? {
              id,
              kind: "stage",
              position,
              data: {
                label: "New Review Stage",
                description: "",
                roleId: null,
                form: emptyFormSchema(),
                outcomes: [
                  createOutcome("Approve", "positive"),
                  createOutcome("Reject", "negative"),
                ],
              },
            }
          : kind === "email"
            ? {
                id,
                kind: "email",
                position,
                data: {
                  label: "Send Email",
                  description: "",
                  templateId: null,
                  recipientMode: "applicant",
                  recipientRoleId: null,
                  recipientEmail: "",
                },
              }
            : {
                id,
                kind: "end",
                position,
                data: {
                  label: "Approved",
                  description: "",
                  result: "approved",
                },
              };

      setGraph((current) => ({ ...current, nodes: [...current.nodes, node] }));
      setSelectedId(id);
    },
    [screenToFlowPosition],
  );

  /* -- Persistence -------------------------------------------------------- */

  function handleSave() {
    startSave(async () => {
      const result = await saveWorkflowDraft({ name, description, graph });
      if (result.ok) {
        setSavedGraph(graph);
        toast.success(
          result.data.issues > 0
            ? `Draft saved with ${result.data.issues} problem(s) still to fix.`
            : "Draft saved.",
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  function handlePublish() {
    startPublish(async () => {
      const result = await publishWorkflow({ name, description, graph });
      if (result.ok) {
        setSavedGraph(graph);
        setSavedPublished(graph);
        setPublishedVersion(result.data.version);
        toast.success(`Published version ${result.data.version}.`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRevert() {
    startRevert(async () => {
      const result = await revertWorkflowDraft();
      if (result.ok) {
        setGraph(result.data.graph);
        setSavedGraph(result.data.graph);
        setSelectedId(null);
        toast.success("Draft reset to the published version.");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleAcceptingChange(next: boolean) {
    setAccepting(next);
    void setAcceptingApplications(next).then((result) => {
      if (result.ok) {
        toast.success(
          next ? "Applications are now open." : "Applications are now closed.",
        );
      } else {
        setAccepting(!next);
        toast.error(result.error);
      }
    });
  }

  // Warn before losing unsaved canvas edits on a full page unload.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return (
    <div className="builder-page">
      <div className="page-header">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="page-title">Workflow builder</h1>
          <p className="page-subtitle">
            Published version {publishedVersion}
            {unpublished ? " · draft has unpublished changes" : ""}
          </p>
        </div>

        <div className="toolbar">
          <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
            <Switch
              id="accepting"
              checked={accepting}
              onCheckedChange={handleAcceptingChange}
              data-testid="accepting-toggle"
            />
            <label htmlFor="accepting" className="text-sm">
              Accepting applications
            </label>
          </div>

          <Button
            variant="outline"
            onClick={handleRevert}
            disabled={isReverting || !savedPublished}
            data-testid="revert-workflow"
          >
            {isReverting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Revert
          </Button>

          <Button
            variant="outline"
            onClick={handleSave}
            disabled={isSaving}
            data-testid="save-workflow"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save draft
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={handlePublish}
                  disabled={isPublishing || errors.length > 0}
                  data-testid="publish-workflow"
                >
                  {isPublishing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Publish
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {errors.length > 0
                ? `Resolve ${errors.length} problem(s) first`
                : "Make this the live workflow for new applications"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div>
          <FieldLabel htmlFor="workflow-name" className="sr-only">
            Workflow name
          </FieldLabel>
          <Input
            id="workflow-name"
            value={name}
            placeholder="Workflow name"
            onChange={(event) => setName(event.target.value)}
            data-testid="workflow-name"
          />
        </div>
        <div>
          <FieldLabel htmlFor="workflow-description" className="sr-only">
            Description
          </FieldLabel>
          <Input
            id="workflow-description"
            value={description}
            placeholder="Short description of this workflow"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <div className="flow-layout">
        <div className="builder-sidebar">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Add a step
          </p>
          <button
            type="button"
            className="palette-item"
            onClick={() => addNode("stage")}
            data-testid="add-stage-node"
          >
            <UserCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block font-medium">Review stage</span>
              <span className="block text-xs text-muted-foreground">
                Waits for a role to act
              </span>
            </span>
          </button>
          <button
            type="button"
            className="palette-item"
            onClick={() => addNode("email")}
            data-testid="add-email-node"
          >
            <Mail className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block font-medium">Send email</span>
              <span className="block text-xs text-muted-foreground">
                Sent in the background, alongside the next step
              </span>
            </span>
          </button>
          <button
            type="button"
            className="palette-item"
            onClick={() => addNode("end")}
            data-testid="add-end-node"
          >
            <CircleCheckBig className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block font-medium">End</span>
              <span className="block text-xs text-muted-foreground">
                Closes the application
              </span>
            </span>
          </button>

          <Separator />

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileInput className="size-4" />
            The submission node is fixed as the entry point.
          </div>

          <Separator />

          <div className="flex items-center gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Validation
            </p>
            {errors.length === 0 ? (
              <Badge variant="outline">
                <CheckCircle2 className="size-3" />
                Ready
              </Badge>
            ) : (
              <Badge variant="destructive">{errors.length}</Badge>
            )}
          </div>

          {issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No problems found. The workflow can be published.
            </p>
          ) : (
            <ScrollArea className="h-56">
              <ul className="flex flex-col gap-2 pr-3" data-testid="issue-list">
                {[...errors, ...warnings].map((issue, index) => (
                  <IssueRow
                    key={index}
                    issue={issue}
                    onSelect={() =>
                      issue.nodeId ? setSelectedId(issue.nodeId) : undefined
                    }
                  />
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>

        <div className="flow-canvas" ref={canvasRef}>
          <ReactFlow
            nodes={canvasNodes}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.6}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>

      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>
            {errors.length} problem{errors.length === 1 ? "" : "s"} block
            publishing
          </AlertTitle>
          <AlertDescription>
            Drafts can be saved in any state, but only a valid workflow can go
            live.
          </AlertDescription>
        </Alert>
      ) : null}

      <NodeInspector
        node={selectedNode}
        roles={roles}
        templates={templates}
        onChange={updateNodeData}
        onDelete={deleteNode}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function IssueRow({
  issue,
  onSelect,
}: {
  issue: GraphIssue;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={!issue.nodeId}
        className="flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
      >
        <AlertTriangle
          className={
            issue.severity === "error"
              ? "mt-0.5 size-3.5 shrink-0 text-destructive"
              : "mt-0.5 size-3.5 shrink-0 text-warning"
          }
        />
        <span>{issue.message}</span>
      </button>
    </li>
  );
}
