"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createProject } from "@/app/(dashboard)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand">
          <Plus className="size-4" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={createProject}>
          <DialogHeader>
            <DialogTitle>Create a new project</DialogTitle>
            <DialogDescription>
              Give your manga animation project a name. You can upload panels
              and start generating right after.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="title">Project title</Label>
            <Input
              id="title"
              name="title"
              placeholder="Chapter 12 — Rooftop Duel"
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand">
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
