import { useCurrentUserSelfDetailsQuery } from "../api_client/user/hooks";
import { useAuth } from "./useAuth";

// The user whose library the signed-in user works in: their own, or the
// library owner's for a library member. The API answers a member with the
// owner's photos and albums, so "is this mine?" compares against this id.
export function useLibraryUserId(): number | null {
  const { userId } = useAuth();
  const { data: self } = useCurrentUserSelfDetailsQuery(userId === null);
  return self?.library_owner?.id ?? userId;
}
