import { describe, expect, it } from "vitest";
import { multipartStream } from "../../../src/api/lib/multipart-stream";

const MiB = 1024 * 1024;
const CHUNK = 64 * 1024;

const textStream = (text: string) => new Blob([text]).stream();

const patternByte = (index: number) => index % 251;

function patternSource(bytes: number) {
  const source = { pulls: 0, stream: null as unknown as ReadableStream };
  let sent = 0;
  source.stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      source.pulls += 1;
      const size = Math.min(CHUNK, bytes - sent);
      if (size === 0) return controller.close();
      controller.enqueue(
        Uint8Array.from({ length: size }, (_, i) => patternByte(sent + i)),
      );
      sent += size;
    },
  });
  return source;
}

const file = (body: ReadableStream, bytes: number) => ({
  fieldName: "video_file_chunk",
  fileName: "chunk.mp4",
  contentType: "video/mp4",
  body,
  bytes,
});

async function readAll(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, from = 0) {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

describe("multipartStream", () => {
  it("streams 25 MiB with an exact contentLength and identical bytes", async () => {
    const bytes = 25 * MiB;
    const source = patternSource(bytes);

    const part = multipartStream(
      { upload_phase: "transfer", start_offset: "0" },
      file(source.stream, bytes),
    );
    const output = await readAll(
      part.body.pipeThrough(new FixedLengthStream(part.contentLength)),
    );

    expect(output.length).toBe(part.contentLength);
    const header = new TextEncoder().encode(
      'filename="chunk.mp4"\r\nContent-Type: video/mp4\r\n\r\n',
    );
    const start = indexOf(output, header) + header.length;
    const boundary = part.contentType.split("boundary=")[1]!;
    const closing = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    expect(output.length - start - closing.length).toBe(bytes);
    let mismatches = 0;
    for (let i = 0; i < bytes; i++) {
      if (output[start + i] !== patternByte(i)) mismatches += 1;
    }
    expect(mismatches).toBe(0);
    expect(output.slice(start + bytes)).toEqual(closing);
  });

  it("reads the source lazily instead of buffering it", async () => {
    const bytes = 25 * MiB;
    const source = patternSource(bytes);

    const part = multipartStream({}, file(source.stream, bytes));
    const pullsBeforeRead = source.pulls;
    const reader = part.body.getReader();
    await reader.read();
    await reader.read();

    expect(pullsBeforeRead).toBeLessThanOrEqual(1);
    expect(source.pulls).toBeLessThanOrEqual(3);
    await reader.cancel();
  });

  it("produces a body that parses as multipart/form-data", async () => {
    const text = "hola mundo";
    const body = textStream(text);
    const part = multipartStream(
      { upload_phase: "transfer", upload_session_id: "s1" },
      file(body, text.length),
    );

    const form = await new Response(part.body, {
      headers: { "Content-Type": part.contentType },
    }).formData();

    expect(form.get("upload_phase")).toBe("transfer");
    expect(form.get("upload_session_id")).toBe("s1");
    const chunk = form.get("video_file_chunk") as unknown as File;
    expect(chunk.name).toBe("chunk.mp4");
    expect(await chunk.text()).toBe(text);
  });

  it("escapes quotes and line breaks in header values", async () => {
    const part = multipartStream(
      {},
      {
        ...file(textStream("x"), 1),
        fileName: 'a"b\r\nX-Injected: 1.png',
      },
    );

    const output = new TextDecoder().decode(await readAll(part.body));

    expect(output).toContain('filename="a%22b%0D%0AX-Injected: 1.png"');
    expect(output).not.toContain("\r\nX-Injected");
  });

  it("uses a fresh boundary per body", () => {
    const first = multipartStream({}, file(textStream(""), 0));
    const second = multipartStream({}, file(textStream(""), 0));

    expect(first.contentType).toMatch(
      /^multipart\/form-data; boundary=[\w-]+$/,
    );
    expect(first.contentType).not.toBe(second.contentType);
  });
});
