"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * A review is reading first and deciding second.
 *
 * The file - what the applicant submitted, and what everyone before this
 * reviewer wrote - opens first and takes the whole page, with the way through
 * to the decision at the foot of it where somebody who has finished reading
 * will be looking. The decision opens with the way back, because changing your
 * mind halfway through a form should not mean hunting for a tab.
 */
export function ReviewWorkspace({
  application,
  decision,
  history,
  decisionLabel,
}: {
  /** The submission and every completed review, in order. */
  application: ReactNode;
  /** The reviewer's own form and outcomes. Null when they cannot act. */
  decision: ReactNode | null;
  history: ReactNode;
  /** What this reviewer's step is called, for the button that opens it. */
  decisionLabel: string;
}) {
  const [tab, setTab] = useState("application");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="flex items-center justify-between gap-4">
        <TabsList>
          <TabsTrigger value="application">The application</TabsTrigger>
          {decision ? (
            <TabsTrigger value="decision" data-testid="tab-decision">
              Your decision
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        {decision && tab === "application" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTab("decision")}
            className="hidden sm:inline-flex"
          >
            Jump to decision
            <ArrowRight className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <TabsContent value="application" className="section-stack pt-4">
        {application}

        {decision ? (
          <div className="decision-handoff">
            <div>
              <p className="font-medium">Read everything above?</p>
              <p className="text-sm text-muted-foreground">
                {decisionLabel} is yours to record. Nothing is sent until you
                choose an outcome.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setTab("decision")}
              data-testid="open-decision"
            >
              Go to your decision
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </TabsContent>

      {decision ? (
        <TabsContent value="decision" className="section-stack pt-4">
          <div>
            <Button
              variant="ghost"
              onClick={() => setTab("application")}
              data-testid="back-to-application"
            >
              <ArrowLeft className="size-4" />
              Back to the application
            </Button>
          </div>
          {decision}
        </TabsContent>
      ) : null}

      <TabsContent value="history" className="pt-4">
        {history}
      </TabsContent>
    </Tabs>
  );
}
