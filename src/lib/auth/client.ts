// Client-side auth re-exports.
//
// Centralises the `@clerk/nextjs` surface so feature code imports from a
// stable internal path. If Clerk's API breaks in a future major, only
// this file needs updating.

"use client";

export {
  ClerkProvider,
  SignIn,
  SignInButton,
  SignOutButton,
  SignUp,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
  useClerk,
  useSignIn,
  useSignUp,
  useUser,
} from "@clerk/nextjs";
