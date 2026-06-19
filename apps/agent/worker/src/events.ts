// Uses Node 22's built-in fetch.

export type JobEvent = Record<string, unknown> & { t: string }

export async function emit(agentBase: string, jobId: string, event: JobEvent): Promise<void> {
  const url = `${agentBase.replace(/\/$/, '')}/worker/events/${jobId}`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
  } catch (err) {
    // Don't let event-channel hiccups kill a capture job.
    console.error('event post failed', err)
  }
}
