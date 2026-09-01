"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleCheckBig,
  FileInput,
  Loader2,
  Lock,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  NODE_TYPES,
  NodeDecorationProvider,
  type BuilderNode,
  type NodeDecorations,
} from "./nodes";
import {
  NodeInspector,
  type RoleOption,
  type TemplateOption,
} from "./node-inspector";
import { PublishDialog } from "./publish-dialog";
import { VersionHistory } from "./version-history";

export type WorkflowBuilderProps = {
  initialGraph: WorkflowGraph;
  /**
   * False for someone who may edit forms but not the flow: the canvas becomes
   * read-only structurally and only the form editor stays available.
   */
  canManageFlow: boolean;
  publishedGraph: WorkflowGraph | null;
  version: number;
  acceptingApplications: boolean;
  roles: RoleOption[];
  templates: TemplateOption[];
};

/* -------------------------------------------------------------------------- */
/*  Domain <-> React Flow conversion                                           */
/* -------------------------------------------------------------------------- */

function toFlowNodes(nodes: WorkflowNode[]): BuilderNode[] {
  return nodes.map(
    (node) =>
      ({
        id: node.id,
        type: node.kind,
        position: node.position,
        data: { payload: node.data },
        // The submission form is the fixed entry point.
        deletable: node.kind !== "start",
      }) as BuilderNode,
  );
}

function toDomainNode(node: BuilderNode): WorkflowNode {
  return {
    id: node.id,
    kind: node.type,
    position: node.position,
    data: node.data.payload,
  } as WorkflowNode;
}

/**
 * A graph in the shape the canvas hands back, so the saved and published
 * copies can be compared against it field for field.
 */
function normalise(graph: WorkflowGraph): WorkflowGraph {
  return {
    nodes: toFlowNodes(graph.nodes).map(toDomainNode),
    edges: graph.edges,
  };
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

/** Everything a step needs to draw itself that its own data does not hold. */
function Decorated({
  decorations,
  children,
}: {
  decorations: NodeDecorations;
  children: React.ReactNode;
}) {
  return (
    <NodeDecorationProvider value={decorations}>
      {children}
    </NodeDecorationProvider>
  );
}

function WorkflowCanvas({
  initialGraph,
  canManageFlow,
  publishedGraph,
  version,
  acceptingApplications,
  roles,
  templates,
}: WorkflowBuilderProps) {
  const { screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  /**
   * The canvas owns the steps.
   *
   * React Flow measures each one on mount and reports the size back as a
   * change. Discarding those left every step unmeasured, which is exactly what
   * "trying to drag a node that is not initialized" reports - the drag had no
   * geometry to work from, so the step and its edges blinked out. Every change
   * it emits is applied here, and the domain graph is derived from the result
   * rather than kept alongside it, so the two cannot disagree.
   */
  const [flowNodes, setFlowNodes] = useState<BuilderNode[]>(() =>
    toFlowNodes(initialGraph.nodes),
  );
  const [edges, setEdges] = useState<WorkflowEdge[]>(initialGraph.edges);

  const graph = useMemo<WorkflowGraph>(
    () => ({ nodes: flowNodes.map(toDomainNode), edges }),
    [flowNodes, edges],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  /** Bumped after a publish so the history sheet refetches. */
  const [historyToken, setHistoryToken] = useState(0);
  const [accepting, setAccepting] = useState(acceptingApplications);
  const [publishedVersion, setPublishedVersion] = useState(version);
  const [savedGraph, setSavedGraph] = useState<WorkflowGraph>(() =>
    normalise(initialGraph),
  );
  const [savedPublished, setSavedPublished] = useState<WorkflowGraph | null>(
    () => (publishedGraph ? normalise(publishedGraph) : null),
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

  /**
   * Flagged steps as a plain string so the decorations below keep their
   * identity across a drag, when validation re-runs on every frame but its
   * verdict does not change.
   */
  const errorKey = useMemo(
    () =>
      Array.from(
        new Set(
          errors
            .map((issue) => issue.nodeId)
            .filter((id): id is string => Boolean(id)),
        ),
      )
        .sort()
        .join("|"),
    [errors],
  );

  const decorations = useMemo<NodeDecorations>(
    () => ({
      errorNodeIds: new Set(errorKey ? errorKey.split("|") : []),
      roleNameById: new Map(roles.map((role) => [role.id, role.name])),
      templateNameById: new Map(
        templates.map((template) => [template.id, template.name]),
      ),
    }),
    [errorKey, roles, templates],
  );

  const dirty = useMemo(
    () => JSON.stringify(graph) !== JSON.stringify(savedGraph),
    [graph, savedGraph],
  );

  const unpublished = useMemo(
    () => JSON.stringify(graph) !== JSON.stringify(savedPublished),
    [graph, savedPublished],
  );

  const flowEdges = useMemo(
    () => toFlowEdges(edges, graph.nodes),
    [edges, graph.nodes],
  );

  const selectedNode =
    graph.nodes.find((node) => node.id === selectedId) ?? null;

  /* -- Graph mutations ---------------------------------------------------- */

  const onNodesChange = useCallback((changes: NodeChange<BuilderNode>[]) => {
    setFlowNodes((current) => applyNodeChanges(changes, current));

    const removed = new Set(
      changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id),
    );
    if (removed.size === 0) return;

    // Dropping a step must drop the connections that referenced it.
    setEdges((current) =>
      current.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target),
      ),
    );
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removals = new Set(
      changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id),
    );
    if (removals.size === 0) return;

    setEdges((current) => current.filter((edge) => !removals.has(edge.id)));
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const handle = connection.sourceHandle ?? DEFAULT_SOURCE_HANDLE;
      const kindOf = (id: string) =>
        flowNodes.find((node) => node.id === id)?.type;
      if (!kindOf(connection.target)) return;

      setEdges((current) => {
        /**
         * A handle may fan out to any number of email steps, but only one step
         * may carry the application forward - so wiring up a new continuation
         * replaces the previous one, while email branches simply accumulate.
         */
        const keep = current.filter((edge) => {
          if (edge.source !== connection.source) return true;
          if (edge.sourceHandle !== handle) return true;
          // Never leave a duplicate of the connection being made.
          if (edge.target === connection.target) return false;
          if (kindOf(connection.target) === "email") return true;
          return kindOf(edge.target) === "email";
        });

        return [
          ...keep,
          {
            id: newId("edge"),
            source: connection.source,
            sourceHandle: handle,
            target: connection.target,
          },
        ];
      });
    },
    [flowNodes],
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: WorkflowNode["data"]) => {
      setFlowNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? ({ ...node, data: { payload: data } } as BuilderNode)
            : node,
        ),
      );
    },
    [],
  );

  const deleteNode = useCallback((nodeId: string) => {
    setFlowNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) =>
      current.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    );
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

      setFlowNodes((current) => [...current, ...toFlowNodes([node])]);
      setSelectedId(id);
    },
    [screenToFlowPosition],
  );

  /* -- Persistence -------------------------------------------------------- */

  /** Replaces the canvas outright: a revert, or a restored revision. */
  function loadGraph(next: WorkflowGraph) {
    setFlowNodes(toFlowNodes(next.nodes));
    setEdges(next.edges);
    setSavedGraph(normalise(next));
  }

  function handleSave() {
    startSave(async () => {
      const result = await saveWorkflowDraft({ graph });
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

  function handlePublish(memo: string) {
    startPublish(async () => {
      const result = await publishWorkflow({ graph, memo });
      if (result.ok) {
        setSavedGraph(graph);
        setSavedPublished(graph);
        setPublishedVersion(result.data.version);
        setPublishOpen(false);
        setHistoryToken((token) => token + 1);
        toast.success(`Published version ${result.data.version}.`);
      } else {
        toast.error(result.error);
      }
    });
  }

  /** An older revision loaded back onto the canvas, not yet published. */
  function handleRestore(restored: WorkflowGraph, version: number) {
    loadGraph(restored);
    setSelectedId(null);
    toast.message(`Editing version ${version}`, {
      description: "Publish to make it the live workflow.",
    });
  }

  function handleRevert() {
    startRevert(async () => {
      const result = await revertWorkflowDraft();
      if (result.ok) {
        loadGraph(result.data.graph);
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
          {canManageFlow ? (
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
          ) : null}

          <VersionHistory
            refreshToken={historyToken}
            onRestore={handleRestore}
          />

          {canManageFlow ? (
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
          ) : null}

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

          {canManageFlow ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={() => setPublishOpen(true)}
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
          ) : null}
        </div>
      </div>

      <div className="flow-layout">
        <div className="builder-sidebar">
          {canManageFlow ? (
            <>
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
                Every application starts at the submission form.
              </div>
            </>
          ) : (
            <div
              className="flex items-start gap-2 rounded-md border p-2.5 text-xs text-muted-foreground"
              data-testid="forms-only-notice"
            >
              <Lock className="mt-0.5 size-4 shrink-0" />
              You can edit the questions on any step. Changing the shape of the
              process needs workflow permission.
            </div>
          )}

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
          <Decorated decorations={decorations}>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodesConnectable={canManageFlow}
              edgesReconnectable={canManageFlow}
              nodesDraggable={canManageFlow}
              elementsSelectable
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
          </Decorated>
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

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        nextVersion={publishedVersion + 1}
        busy={isPublishing}
        onConfirm={handlePublish}
      />

      <NodeInspector
        node={selectedNode}
        roles={roles}
        templates={templates}
        canManageFlow={canManageFlow}
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
