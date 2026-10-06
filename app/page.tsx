import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Film,
  Palette,
  Sparkles,
  Wand2,
  Zap,
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

const steps = [
  {
    icon: Film,
    title: "1. Import your panels",
    description:
      "Drag and drop manga pages or individual cases — black & white or color, single page or full chapter.",
  },
  {
    icon: Wand2,
    title: "2. AI motion & color",
    description:
      "KomaMotion detects panels, applies optional dynamic colorization, and generates fluid image-to-video motion.",
  },
  {
    icon: Clapperboard,
    title: "3. Preview & export",
    description:
      "Fine-tune camera movement, intensity and FPS, then export in MP4 up to 4K for your webtoon or trailer.",
  },
];

const features = [
  {
    icon: Sparkles,
    title: "Image-to-Video AI",
    description:
      "Built on state-of-the-art diffusion video models for smooth, believable motion from a single still frame.",
  },
  {
    icon: Palette,
    title: "Dynamic colorization",
    description:
      "Optional AI colorization pass for black & white manga, tuned to preserve linework and shading.",
  },
  {
    icon: Zap,
    title: "No timeouts, ever",
    description:
      "Generation runs on a durable async job queue — close the tab, come back, your render keeps going.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
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
              Bring your manga panels{" "}
              <span className="brand-gradient-text">to life</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              KomaMotion AI transforms static manga pages and webtoon panels
              into fluid, cinematic video sequences — powered by image-to-video
              generation built for studios and creators.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="brand">
                <Link href="/register">
                  Start animating free <ArrowRight className="size-4" />
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
              From still panel to motion in three steps
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

        <section id="pricing" className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-12 text-center">
            <Badge variant="brand" className="mb-4">
              Pricing
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight">
              Pay for the minutes you generate
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Every plan includes a monthly pool of render credits. 1 credit ≈
              1 second of generated video.
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
                    {plan.credits.toLocaleString()} credits / mo
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
