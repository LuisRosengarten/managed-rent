import { TERMINAL_APPLICATION_STATUSES } from "@workspace/core/status"
import type {
  ApplicationStatus,
  ApplicationStatusSource,
  ListingData,
} from "@workspace/core/types"

export function buildListingTitle(data: ListingData, fallbackSubject?: string): string {
  const explicit = normalizeText(data.title)
  if (explicit) return explicit

  const parts = [
    typeof data.rooms === "number" ? `${trimZero(data.rooms)} Zi.` : null,
    typeof data.sizeSqm === "number" ? `${trimZero(data.sizeSqm)} m²` : null,
    data.city ? normalizeText(data.city) : null,
    data.district ? normalizeText(data.district) : null,
    typeof data.rentWarm === "number"
      ? `${trimZero(data.rentWarm)} € warm`
      : typeof data.rentCold === "number"
        ? `${trimZero(data.rentCold)} € kalt`
        : null,
  ].filter(Boolean)

  if (parts.length > 0) return parts.join(" · ")

  return normalizeText(fallbackSubject) || "Objekt aus Mail"
}

export function hasEnoughIdentity(data: ListingData): boolean {
  return Boolean(
    data.sourceUrl ||
      (data.street && data.city) ||
      (data.zip && data.city) ||
      data.landlordEmail
  )
}

export function shouldApplyAiStatus(args: {
  currentStatus: ApplicationStatus
  statusSource: ApplicationStatusSource
}): boolean {
  return !(
    args.statusSource === "manual" &&
    isTerminalStatus(args.currentStatus)
  )
}

function isTerminalStatus(status: ApplicationStatus): boolean {
  return (TERMINAL_APPLICATION_STATUSES as readonly string[]).includes(status)
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? ""
}

function trimZero(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
