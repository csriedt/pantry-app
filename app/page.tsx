import { ProductLanding } from "@/components/screens/product-landing";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import type { Metadata } from "next";

const TITLE = `${SITE_NAME} — AI sales assistant that never lets a lead go cold`;

export const metadata: Metadata = {
  // Absolute: the home page owns the brand, so skip the "· PreviousApp" template.
  title: { absolute: TITLE },
  description: SITE_DESCRIPTION,
  // Canonical URL for this page — tells search engines "/" is the one true home.
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: SITE_DESCRIPTION, url: "/" },
  twitter: { title: TITLE, description: SITE_DESCRIPTION },
};

export default function Home() {
  return <ProductLanding />;
}
