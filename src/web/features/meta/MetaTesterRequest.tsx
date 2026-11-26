import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Input } from "../../components/TextField";
import { t } from "../../i18n/es-AR";
import { metaErrorMessage } from "./meta-errors";
import { useRequestMetaTester } from "./use-meta-connections";

const META_REQUESTS_URL = "https://developers.facebook.com/requests";

export function MetaTesterRequest() {
  const [facebookUserId, setFacebookUserId] = useState("");
  const request = useRequestMetaTester();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    request.mutate({ facebookUserId });
  }

  return (
    <details className="rounded-sm border border-rule p-3 text-ink">
      <summary className="cursor-pointer">
        {t("connections.testerToggle")}
      </summary>
      {request.isSuccess ? (
        <p role="status" className="mt-3">
          {t("connections.testerDone")}{" "}
          <a
            href={META_REQUESTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            developers.facebook.com/requests
          </a>
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <p>{t("connections.testerIntro")}</p>
          <Input
            label={t("connections.testerId")}
            inputMode="numeric"
            pattern="\d{5,25}"
            required
            autoComplete="off"
            value={facebookUserId}
            onChange={(event) => setFacebookUserId(event.target.value.trim())}
          />
          {request.isError && (
            <p role="alert" className="rounded-sm bg-loss-soft p-3 text-loss">
              {metaErrorMessage(request.error)}
            </p>
          )}
          <div>
            <Button
              type="submit"
              variant="secondary"
              loading={request.isPending}
              loadingLabel={t("common.working")}
            >
              {t("connections.testerSubmit")}
            </Button>
          </div>
        </form>
      )}
    </details>
  );
}
