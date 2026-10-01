"use client";

import Link from "next/link";
import { TransactionIntelligence } from "@/components/TransactionIntelligence";
import RealEstateCommand from "@/components/RealEstateCommand";
import BusinessIncome from "@/components/BusinessIncome";
import AIInsightsFeed from "@/components/AIInsightsFeed";

export default function DetailsPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6 max-w-screen-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-mono font-bold tracking-tight text-text-primary">
              Cottonstone Command Center
            </h1>
            <p className="text-xs font-mono text-text-secondary mt-0.5">
              Details: transactions, real estate, business income, insights
            </p>
          </div>
          <Link href="/" className="text-xs font-mono text-accent-green hover:underline">
            Back to home
          </Link>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <TransactionIntelligence />
          <RealEstateCommand />
          <BusinessIncome />
          <div className="xl:col-span-2">
            <AIInsightsFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
