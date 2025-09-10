import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RAG Application - Retrieval-Augmented Generation",
  description: "A production-ready RAG application with document upload, vector search, reranking, and LLM-powered answers with citations. Built with Next.js, Pinecone, OpenAI, Groq, and Cohere.",
  keywords: ["RAG", "AI", "LLM", "Vector Search", "Document QA", "Citations"],
  authors: [{ name: "Piyush Mishra", url: "https://github.com/piyushmishra"}],
  openGraph: {
    title: "RAG Application",
    description: "Ask questions about your documents with AI-powered search and citations",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
