"use client";

import type { ReactNode } from "react";
import { useTheme } from "next-themes";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-micro tracking-micro text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Design gallery — every primitive in its states, light and dark. View in the
 * browser's mobile mode for the 390px board comparison.
 * This is the verification surface: render beside the board
 * and compare state by state.
 */
export default function DesignPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <main className="flex w-full flex-col gap-8 p-5 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-title font-semibold">Primitives</h1>
        <Button variant="secondary" size="sm" onClick={toggleTheme}>
          {isDark ? "Light" : "Dark"}
        </Button>
      </header>

      <Section title="Buttons">
        <div className="flex flex-col gap-2">
          <Button>Made it</Button>
          <Button variant="secondary">Retry</Button>
          <Button variant="chef">Ask the chef</Button>
          <Button variant="commit">Commit</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete account</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="xs" variant="secondary">
            XS
          </Button>
          <Button size="icon" variant="secondary" aria-label="Add">
            +
          </Button>
        </div>
      </Section>

      <Section title="Input">
        <Input placeholder="Add an item" />
        <Input defaultValue="500 g" />
        <Input placeholder="Disabled" disabled />
        <Input placeholder="Invalid" aria-invalid />
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Onions</Badge>
          <Badge>Rice</Badge>
          <Badge variant="tap">Tap chip</Badge>
          <Badge variant="secondary">+ added</Badge>
          <Badge variant="short">short</Badge>
          <Badge variant="out">out</Badge>
          <Badge variant="destructive">danger</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Onion rice</CardTitle>
            <CardDescription>Made Tuesday · 4 items</CardDescription>
          </CardHeader>
          <CardContent className="text-small text-muted-foreground">
            Rice · Onions · Olive oil · Stock
          </CardContent>
          <CardFooter>
            <Button size="sm">Made it</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Banners">
        <Alert>
          <AlertTitle>Pantry changed — refreshing…</AlertTitle>
          <AlertDescription>Content stays underneath.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Could not reach the pantry</AlertTitle>
          <AlertDescription>
            Retry, or keep reading what&rsquo;s on screen.
          </AlertDescription>
        </Alert>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="pantry">
          <TabsList>
            <TabsTrigger value="pantry">Your pantry</TabsTrigger>
            <TabsTrigger value="popular">Popular</TabsTrigger>
            <TabsTrigger value="made">Made meals</TabsTrigger>
          </TabsList>
          <TabsContent value="pantry" className="text-small text-muted-foreground">
            Feasible recipes.
          </TabsContent>
          <TabsContent value="popular" className="text-small text-muted-foreground">
            Signal-backed ideas.
          </TabsContent>
          <TabsContent value="made" className="text-small text-muted-foreground">
            Recently made.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Skeleton">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
      </Section>

      <Section title="Kbd / status">
        <div className="flex flex-wrap gap-2">
          <Kbd>v43 · synced</Kbd>
          <Kbd>read-only</Kbd>
        </div>
      </Section>

      <Section title="Toast">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => toast.success("Added · Onions")}
          >
            Success toast
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => toast.error("Something went wrong", "Boom.")}
          >
            Error toast
          </Button>
        </div>
      </Section>

      <Section title="Dialog / Sheet">
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="secondary" />}>
              Open dialog
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  The chef wants to deduct 300 g of Rice
                </DialogTitle>
                <DialogDescription>Apply it?</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button size="sm" variant="secondary">
                  Not now
                </Button>
                <Button size="sm">Apply</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger render={<Button size="sm" variant="secondary" />}>
              Open sheet
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>Rice</SheetTitle>
                <SheetDescription>
                  amount stepper · set stocked/short/out · Remove
                </SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </div>
      </Section>

      <Separator />
      <p className="text-small text-muted-foreground">
        Design gallery — compare in mobile mode (390px), light and dark.{" "}
        <a href="/design/composites" className="underline underline-offset-2">
          Composites →
        </a>
      </p>
    </main>
  );
}
