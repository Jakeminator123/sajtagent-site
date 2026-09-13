"use client"

import { useState } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useBuilder } from "./builder-store"

export function ResetStarterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { resetStarter, isResettingProject } = useBuilder()
  const [error, setError] = useState<string | null>(null)
  return (
    <AlertDialog open={open} onOpenChange={(next) => {
      if (isResettingProject) return
      setError(null)
      onOpenChange(next)
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Radera innehållet i ditt personliga startprojekt?</AlertDialogTitle>
          <AlertDialogDescription>
            Versioner, preview och chattsessioner i startprojektet raderas permanent.
            Dina andra projekt påverkas inte. Välj Nytt projekt om du vill behålla allt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResettingProject}>Avbryt</AlertDialogCancel>
          <AlertDialogAction disabled={isResettingProject} className="bg-destructive text-destructive-foreground" onClick={async (event) => {
            event.preventDefault()
            const result = await resetStarter()
            if (!result.ok) setError(result.error)
            else onOpenChange(false)
          }}>Radera startprojektets innehåll</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
