import { Suspense } from "react";
import { AccountDeletedNotice } from "@/components/account-deleted-notice";
import Link from "next/link";
import {
  ArrowRight,
  Captions,
  Clapperboard,
  Eraser,
  PenTool,
  Scissors,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wand2,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NexulysBadge } from "@/components/branding/nexulys-badge";
import { ALL_PLANS } from "@/lib/stripe/plans";
import { formatVideoDuration, seconds1080pFor } from "@/lib/stripe/credits";

const steps = [
  {
    icon: Scissors,
    title: "1. Drop in your pages",
    description:
      "Upload pages or single panels. KomaMotion splits pages into panels and can erase speech bubbles before animating.",
  },
  {
    icon: Wand2,
    title: "2. Animate each panel",
    description:
      "Choose the camera move and intensity, render 6–10 s clips in 1080p or 4K, colorize black & white art if you like.",
  },
  {
    icon: Clapperboard,
    title: "3. Get a finished episode",
    description:
      "Put the clips in order, add a title card and captions, and download one vertical video ready for TikTok, Reels or Shorts.",
  },
];

const features = [
  {
    icon: Smartphone,
    title: "Made for vertical video",
    description:
      "Episodes come out in 9:16 with each panel kept whole over a soft blurred fill — or 16:9 and 1:1 for YouTube and Instagram.",
  },
  {
    icon: Captions,
    title: "Titles & captions built in",
    description:
      "Add a title card and a line of dialogue or narration per panel; they're burned into the video, no editing app needed.",
  },
  {
    icon: Eraser,
    title: "Manga-aware cleanup",
    description:
      "Page splitting, speech-bubble removal and optional colorization prepare panels so the motion looks right.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <Suspense>
        <AccountDeletedNotice />
      </Suspense>
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(ellipse_at_top,_var(--brand-violet)_0%,_transparent_60%)] opacity-25"
          />
          <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-20 text-center">
            <div className="mx-auto mb-6 flex w-fit items-center justify-center">
              <NexulysBadge />
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              Turn your manga chapter into a{" "}
              <span className="brand-gradient-text">video ready to post</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              For manga and webtoon creators promoting their own series: animate your panels with AI, then
              get one vertical episode with titles and captions — for TikTok, Reels and Shorts, without an
              editing app or a motion designer.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="brand">
                <Link href="/register">
                  Make your first episode free <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/#how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-12 text-center">
            <Badge variant="brand" className="mb-4">
              Workflow
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight">
              From your pages to a postable episode in three steps
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step) => (
              <Card key={step.title} className="glass-panel">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-lg brand-gradient-bg text-white">
                    <step.icon className="size-5" />
                  </div>
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/20">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="grid gap-6 md:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="space-y-3">
                  <feature.icon className="size-6 text-primary" />
                  <h3 className="font-medium">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="glass-panel">
              <CardHeader>
                <PenTool className="mb-2 size-6 text-primary" />
                <CardTitle>Built for people who own their story</CardTitle>
                <CardDescription>
                  Independent mangaka, webtoon artists and small publishers use KomaMotion to make trailers and
                  recap episodes of their own series — the promo videos that used to cost a motion designer&apos;s day.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="glass-panel">
              <CardHeader>
                <ShieldCheck className="mb-2 size-6 text-primary" />
                <CardTitle>Your work stays yours</CardTitle>
                <CardDescription>
                  You keep the rights to what you upload and what you make. Only upload pages you created or have
                  permission to adapt — published manga is protected by copyright.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-12 text-center">
            <Badge variant="brand" className="mb-4">
              Pricing
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight">
              Pay for the minutes you generate
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Every plan includes a monthly pool of render credits. A second of
              video costs 3 credits in 1080p, 12 in 4K.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {ALL_PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={
                  plan.highlighted
                    ? "border-primary/60 shadow-lg shadow-fuchsia-500/10"
                    : ""
                }
              >
                <CardHeader>
                  {plan.highlighted && (
                    <Badge variant="brand" className="mb-2 w-fit">
                      Most popular
                    </Badge>
                  )}
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-4">
                    <span className="text-3xl font-semibold">
                      ${plan.price}
                    </span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {plan.credits.toLocaleString()} credits {plan.stripePriceId ? "/ mo" : "on signup"}
                    <span className="block text-xs font-normal text-muted-foreground">
                      ≈ {formatVideoDuration(seconds1080pFor(plan.credits))} of 1080p video
                    </span>
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-4 w-full" variant={plan.highlighted ? "brand" : "outline"}>
                    <Link href="/register">Choose {plan.name}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
