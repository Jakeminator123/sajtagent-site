"use client"

import { useRef, useState, type MouseEvent } from "react"
import { ChevronDown, FolderPlus, MessageSquare, Plus } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  NEW_CHAT_LABEL,
  NEW_DRAFT_TRIGGER_ARIA_LABEL,
  NEW_DRAFT_TRIGGER_LABEL,
  NEW_PROJECT_CONFIRM_ACTION,
  NEW_PROJECT_CONFIRM_CANCEL,
  NEW_PROJECT_CONFIRM_DESCRIPTION,
  NEW_PROJECT_CONFIRM_TITLE,
  NEW_PROJECT_LABEL,
} from "./new-draft-menu"

const headerControlClassName =
  "flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-sm bg-workflow-surface border border-workflow-border text-workflow-text-muted hover:text-workflow-text hover:bg-workflow-surface-hover transition-colors duration-200"

interface NewDraftMenuProps {
  newChat: () => void
  newProject: () => Promise<{ ok: true } | { ok: false; error: string }>
  isResettingProject: boolean
}

export function NewDraftMenu({
  newChat,
  newProject,
  isResettingProject,
}: NewDraftMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const openConfirm = () => {
    setConfirmError(null)
    setConfirmOpen(true)
  }

  const handleConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const result = await newProject()
    if (!result.ok) {
      setConfirmError(result.error)
      return
    }
    setConfirmOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={NEW_DRAFT_TRIGGER_ARIA_LABEL}
            aria-haspopup="menu"
            disabled={isResettingProject}
            className={headerControlClassName}
          >
            <Plus className="w-4 h-4" />
            {NEW_DRAFT_TRIGGER_LABEL}
            <ChevronDown className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="font-mono text-xs"
          onEscapeKeyDown={() => triggerRef.current?.focus()}
        >
          <DropdownMenuItem
            disabled={isResettingProject}
            onSelect={() => {
              newChat()
            }}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-2" />
            {NEW_CHAT_LABEL}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isResettingProject}
            onSelect={() => {
              openConfirm()
            }}
          >
            <FolderPlus className="w-3.5 h-3.5 mr-2" />
            {NEW_PROJECT_LABEL}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (isResettingProject) return
          setConfirmOpen(open)
          if (!open) setConfirmError(null)
        }}
      >
        <AlertDialogContent
          className="font-mono border-workflow-border bg-workflow-bg text-workflow-text"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
          onEscapeKeyDown={(event) => {
            if (isResettingProject) event.preventDefault()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{NEW_PROJECT_CONFIRM_TITLE}</AlertDialogTitle>
            <AlertDialogDescription className="text-workflow-text-muted">
              {NEW_PROJECT_CONFIRM_DESCRIPTION}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmError ? (
            <p role="alert" className="text-sm text-destructive">
              {confirmError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResettingProject}>
              {NEW_PROJECT_CONFIRM_CANCEL}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isResettingProject}
              className={cn(
                buttonVariants({ variant: "destructive" }),
                "font-mono",
              )}
              onClick={(event) => {
                void handleConfirm(event)
              }}
            >
              {NEW_PROJECT_CONFIRM_ACTION}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
