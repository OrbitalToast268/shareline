import { onAuthStateChanged, signInAnonymously, User } from "firebase/auth";
import { auth } from "./firebase";

let cachedUser: User | null = null;
let inflight: Promise<User> | null = null;

export async function ensureAnonUser(): Promise<User> {
  if (cachedUser) return cachedUser;
  if (inflight) return inflight;

  inflight = new Promise<User>((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        try {
          if (user) {
            cachedUser = user;
            unsub();
            resolve(user);
            return;
          }

          const cred = await signInAnonymously(auth);
          cachedUser = cred.user;
          unsub();
          resolve(cred.user);
        } catch (e) {
          unsub();
          reject(e);
        }
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });

  return inflight;
}