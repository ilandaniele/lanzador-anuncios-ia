import { randomToken } from "./hash";

export interface MultipartFile {
  fieldName: string;
  fileName: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
  bytes: number;
}

export interface MultipartBody {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number;
}

const CRLF = "\r\n";
const encoder = new TextEncoder();

const headerValue = (value: string) =>
  value.replaceAll('"', "%22").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

const disposition = (name: string) =>
  `Content-Disposition: form-data; name="${headerValue(name)}"`;

function preamble(
  boundary: string,
  fields: Record<string, string>,
  file: MultipartFile,
) {
  const parts = Object.entries(fields).map(
    ([name, value]) =>
      `--${boundary}${CRLF}${disposition(name)}${CRLF}${CRLF}${value}${CRLF}`,
  );
  parts.push(
    `--${boundary}${CRLF}${disposition(file.fieldName)}; filename="${headerValue(file.fileName)}"${CRLF}` +
      `Content-Type: ${headerValue(file.contentType)}${CRLF}${CRLF}`,
  );
  return encoder.encode(parts.join(""));
}

export function multipartStream(
  fields: Record<string, string>,
  file: MultipartFile,
): MultipartBody {
  const boundary = `----lanzador${randomToken(18)}`;
  const head = preamble(boundary, fields, file);
  const tail = encoder.encode(`${CRLF}--${boundary}--${CRLF}`);
  const reader = file.body.getReader();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(head);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (!done) return controller.enqueue(value);
      controller.enqueue(tail);
      controller.close();
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    contentLength: head.length + file.bytes + tail.length,
  };
}
