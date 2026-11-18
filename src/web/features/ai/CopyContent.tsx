import { COPY_LIMITS } from "../../../shared/constants";
import type { CopyDto } from "../../../shared/schemas/copies";
import { cx } from "../../components/classes";
import { Counter } from "../../components/TextField";

type CopyTextProps = {
  id?: string;
  text: string;
  limit: number;
  className?: string;
};

function CopyText({ id, text, limit, className }: CopyTextProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p id={id} className={cx("leading-normal", className)}>
        {text}
      </p>
      <Counter length={text.length} limit={limit} />
    </div>
  );
}

type CopyContentProps = {
  copy: Pick<CopyDto, "primaryText" | "headline" | "description">;
  headlineId: string;
};

export function CopyContent({ copy, headlineId }: CopyContentProps) {
  return (
    <div className="flex flex-col gap-2">
      <CopyText
        text={copy.primaryText}
        limit={COPY_LIMITS.primaryText}
        className="text-md"
      />
      <CopyText
        id={headlineId}
        text={copy.headline}
        limit={COPY_LIMITS.headline}
        className="font-medium"
      />
      {copy.description && (
        <CopyText
          text={copy.description}
          limit={COPY_LIMITS.description}
          className="text-ink-muted"
        />
      )}
    </div>
  );
}
