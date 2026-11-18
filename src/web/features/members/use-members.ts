import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { PAGINATION, type InvitableRole } from "../../../shared/constants";
import type {
  CreateInvitationRequest,
  InvitationDto,
} from "../../../shared/schemas/invitations";
import type { MemberDto } from "../../../shared/schemas/members";
import { apiFetch } from "../../lib/api";
import { qk } from "../../lib/query-keys";

type Page<Item> = { data: Item[]; nextCursor: string | null };

const workspaceApi = (workspaceId: string) => `/api/w/${workspaceId}`;
const firstPage = `?limit=${PAGINATION.maxLimit}`;

export const useMembers = (workspaceId: string) =>
  useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: async () =>
      (
        await apiFetch<Page<MemberDto>>(
          `${workspaceApi(workspaceId)}/members${firstPage}`,
        )
      ).data,
  });

export const useInvitations = (workspaceId: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.invitations(workspaceId),
    enabled,
    queryFn: async () =>
      (
        await apiFetch<Page<InvitationDto>>(
          `${workspaceApi(workspaceId)}/invitations${firstPage}`,
        )
      ).data,
  });

function useWorkspaceMutation<Input>(
  workspaceId: string,
  send: (input: Input) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  const affected: QueryKey[] = [
    qk.members(workspaceId),
    qk.invitations(workspaceId),
    qk.me(),
  ];
  return useMutation({
    mutationFn: async (input: Input) => {
      await send(input);
    },
    onSuccess: () =>
      Promise.all(
        affected.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}

export const useInviteMember = (workspaceId: string) =>
  useWorkspaceMutation(workspaceId, (body: CreateInvitationRequest) =>
    apiFetch(`${workspaceApi(workspaceId)}/invitations`, {
      method: "POST",
      body,
    }),
  );

export const useChangeMemberRole = (workspaceId: string) =>
  useWorkspaceMutation(
    workspaceId,
    ({ userId, role }: Pick<MemberDto, "userId"> & { role: InvitableRole }) =>
      apiFetch(`${workspaceApi(workspaceId)}/members/${userId}`, {
        method: "PATCH",
        body: { role },
      }),
  );

export const useRemoveMember = (workspaceId: string) =>
  useWorkspaceMutation(workspaceId, (userId: string) =>
    apiFetch(`${workspaceApi(workspaceId)}/members/${userId}`, {
      method: "DELETE",
    }),
  );

export const useRevokeInvitation = (workspaceId: string) =>
  useWorkspaceMutation(workspaceId, (invitationId: string) =>
    apiFetch(`${workspaceApi(workspaceId)}/invitations/${invitationId}`, {
      method: "DELETE",
    }),
  );

export const useTransferOwnership = (workspaceId: string) =>
  useWorkspaceMutation(workspaceId, (userId: string) =>
    apiFetch(`${workspaceApi(workspaceId)}/transfer-ownership`, {
      method: "POST",
      body: { userId, confirm: true },
    }),
  );
