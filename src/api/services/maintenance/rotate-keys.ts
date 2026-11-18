import type { Env } from "../../env";
import { fulfilledValues, throwFirstRejection } from "../../lib/settled";
import { aadFor, decryptToken, encryptToken } from "../../lib/token-crypto";
import {
  type RotatedToken,
  saveRotatedTokens,
  selectStaleGoogleTokens,
  selectStaleMetaTokens,
  type StaleToken,
} from "../../repositories/token-rotation";
import { googleTokenAad } from "../google/connection";

const TOKENS_PER_RUN = 50;
const KEY_VERSION_NAME = /^TOKEN_ENC_KEY_V(\d+)$/;

type KeyEnv = Pick<Env, "DB" | "TOKEN_ENC_KEY_CURRENT">;

async function reseal(
  env: KeyEnv,
  token: StaleToken,
  aad: string,
): Promise<RotatedToken> {
  const plaintext = await decryptToken(
    env,
    {
      ciphertext: new Uint8Array(token.ciphertext),
      iv: new Uint8Array(token.iv),
      keyVersion: token.keyVersion,
    },
    aad,
  );
  return {
    id: token.id,
    previousVersion: token.keyVersion,
    sealed: await encryptToken(env, plaintext, aad),
  };
}

function rotatableKeyVersions(env: KeyEnv): number[] {
  const current = Number(env.TOKEN_ENC_KEY_CURRENT);
  return Object.entries(env).flatMap(([name, value]) => {
    const version = Number(KEY_VERSION_NAME.exec(name)?.[1]);
    const usable = typeof value === "string" && value !== "";
    return usable && Number.isInteger(version) && version !== current
      ? [version]
      : [];
  });
}

export async function rotateTokenKeys(env: KeyEnv, at: number): Promise<void> {
  const versions = rotatableKeyVersions(env);
  if (versions.length === 0) return;
  const [metaTokens, googleTokens] = await Promise.all([
    selectStaleMetaTokens(env.DB, versions, TOKENS_PER_RUN),
    selectStaleGoogleTokens(env.DB, versions, TOKENS_PER_RUN),
  ]);
  const [meta, google] = await Promise.all([
    Promise.allSettled(
      metaTokens.map((token) =>
        reseal(
          env,
          token,
          aadFor("meta_connections", token.id, token.workspaceId),
        ),
      ),
    ),
    Promise.allSettled(
      googleTokens.map((token) =>
        reseal(env, token, googleTokenAad(token, token.id)),
      ),
    ),
  ]);
  await saveRotatedTokens(
    env.DB,
    { meta: fulfilledValues(meta), google: fulfilledValues(google) },
    at,
  );
  throwFirstRejection([...meta, ...google]);
}
