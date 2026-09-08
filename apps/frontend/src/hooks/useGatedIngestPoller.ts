import { useEffect, useRef } from 'react'
import { type QueryClient } from '@tanstack/react-query'

import { type FileUpload } from '~/components/UIUC-Components/UploadNotification'
import {
  fetchIngestStatus,
  type IngestStatus,
  type IngestStatusFilter,
} from '~/utils/ingestStatusClient'

/**
 * An upload of `type` this component is still waiting on. The gate, the
 * server-side filter and the status mapping must all agree on this, or a file
 * the tick never asked about could be reclassified from its results.
 */
export const isActiveUpload = (file: FileUpload, type: FileUpload['type']) =>
  file.type === type &&
  (file.status === 'uploading' || file.status === 'ingesting')

/**
 * Polls the ingest-status endpoints ONLY while uploads of `type` are in
 * flight, and refreshes the documents table when a tick actually changes
 * something. Idle dashboards issue no requests at all.
 *
 * `buildFilter` names the rows this component cares about so the endpoints
 * can filter server-side instead of returning the whole documents table;
 * `applyStatus` must be a pure `files -> files` mapping, since it may be
 * re-run inside the state updater when entries were appended mid-tick.
 */
export function useGatedIngestPoller({
  courseName,
  uploadFiles,
  setUploadFiles,
  queryClient,
  type,
  intervalMs,
  buildFilter,
  applyStatus,
}: {
  courseName: string
  uploadFiles: FileUpload[]
  setUploadFiles: React.Dispatch<React.SetStateAction<FileUpload[]>>
  queryClient: QueryClient
  type: FileUpload['type']
  intervalMs: number
  buildFilter: (files: FileUpload[]) => IngestStatusFilter
  applyStatus: (status: IngestStatus, files: FileUpload[]) => FileUpload[]
}) {
  const isActive = uploadFiles.some((file) => isActiveUpload(file, type))

  // Latest-value refs: the effect re-runs only when the gate flips, so
  // everything it reads per tick must come through a ref rather than the
  // closure of the render that opened the gate.
  const filesRef = useRef(uploadFiles)
  const buildFilterRef = useRef(buildFilter)
  const applyStatusRef = useRef(applyStatus)
  useEffect(() => {
    filesRef.current = uploadFiles
    buildFilterRef.current = buildFilter
    applyStatusRef.current = applyStatus
  })

  const wasActiveRef = useRef(false)

  useEffect(() => {
    const invalidate = (key: 'documents' | 'failedDocuments') =>
      void queryClient.invalidateQueries({ queryKey: [key, courseName] })

    if (!isActive) {
      if (wasActiveRef.current) {
        // Gate just closed — final refresh, a backstop for anything the
        // per-tick diffs missed (e.g. a row that lands just after the file
        // went terminal, or an error set outside the poller). Worth one
        // possibly-redundant refetch per batch.
        wasActiveRef.current = false
        invalidate('documents')
        invalidate('failedDocuments')
      }
      return
    }
    wasActiveRef.current = true

    let inFlight = false
    // Results of a tick that was still in flight when the gate closed (or the
    // component unmounted) must be discarded: they describe a filter that no
    // longer matches what is being tracked, so applying them could mark a
    // healthy ingest as failed.
    let cancelled = false

    const checkIngestStatus = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const status = await fetchIngestStatus(
          courseName,
          buildFilterRef.current(filesRef.current),
        )
        // Null means a request failed or there was nothing to ask about.
        // Never read that as "the document vanished" — skip the tick.
        if (!status || cancelled) return

        const snapshot = filesRef.current
        const next = applyStatusRef.current(status, snapshot)
        // Appended entries compare against `undefined`, so they are `changed`
        // too — one signal covers both re-classified and newly-found files.
        const changed = next.filter((file, i) => file !== snapshot[i])

        // A steady tick changes nothing; re-rendering the upload toast anyway
        // would defeat the point of this hook.
        if (changed.length === 0) return

        // `next` already covers the common case; recompute only when entries
        // were appended while the request was in flight, since applyStatus can
        // be O(n·m) over a large crawl.
        setUploadFiles((prev) =>
          prev === snapshot ? next : applyStatusRef.current(status, prev),
        )

        // Only completions can change the documents table, so a tick that
        // merely discovers more in-progress URLs — every tick of a live crawl
        // — must not trigger the expensive table refetch.
        if (changed.some((file) => file.status === 'complete')) {
          invalidate('documents')
        }
        if (changed.some((file) => file.status === 'error')) {
          invalidate('failedDocuments')
        }
      } catch (error) {
        console.error('Error checking ingest status:', error)
      } finally {
        inFlight = false
      }
    }

    const intervalId = setInterval(checkIngestStatus, intervalMs)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
    // `queryClient` and `setUploadFiles` are deliberately omitted. Their
    // identities may change per render, but each only delegates to a stable
    // target (the query cache, the state setter), so whichever instance the
    // effect captured is equivalent. Depending on them would tear down and
    // re-arm the interval on every parent render — exactly the polling churn
    // this hook exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, courseName, intervalMs])
}
