"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export function GoogleOAuthWrapper({ children }: { children: React.ReactNode }) {
  // Always wrap with the provider so nested GoogleLogin components
  // don't throw during Next.js static prerendering.
  // If no real client ID is configured, the GoogleLogin button will
  // simply not work, but it won't crash during SSG.
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || "placeholder"}>
      {children}
    </GoogleOAuthProvider>
  );
}
