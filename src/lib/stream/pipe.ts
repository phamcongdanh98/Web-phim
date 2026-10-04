/**
 * Re-streams an upstream body to the client with native backpressure: `pull` only reads the next
 * chunk when the consumer asks for more, so memory stays at ~one chunk per connection regardless of
 * file size (the video is never buffered). `release` runs exactly once on end, error or cancel.
 */
export function pipeWithRelease(upstream: ReadableStream<Uint8Array>, release: () => void): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    release();
  };
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const { done: end, value } = await reader.read();
          if (end) {
            finish();
            controller.close();
          } else if (value) {
            controller.enqueue(value);
          }
        } catch (err) {
          finish();
          // Aborted fetch (viewer closed the tab / seeked) or upstream failure after bytes were sent.
          controller.error(err);
        }
      },
      async cancel(reason) {
        finish();
        await reader.cancel(reason).catch(() => undefined);
      },
    },
    { highWaterMark: 0 }, // do not read ahead of the consumer
  );
}
