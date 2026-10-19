import { OFFERING } from '../content';
import { CrowdCanvas } from './ui/skiper-ui/skiper39';
import { Icon } from './Icon';

/**
 * The landing page's first screen: what's on offer and the headline at the top, and Skiper UI's
 * walking crowd (skiper39) in the space left below. The crowd fills whatever height the text leaves,
 * so on short or narrow screens it shrinks instead of running into the text.
 */
export function LandingHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative flex h-[calc(100svh-65px)] min-h-[600px] w-full flex-col items-center overflow-hidden bg-background"
    >
      <div className="hero-text relative z-10 flex w-full flex-col items-center px-[var(--gutter)] pt-12 text-center md:pt-20">
        <p className="hero-eyebrow">{OFFERING.title}</p>
        <h1 id="hero-heading" className="display hero-title">
          Find a time that works.
        </h1>
        <p className="lede hero-lede">{OFFERING.summary} Pick an open slot below. Booking takes less than a minute.</p>
        <ul className="hero-facts" aria-label="About the sessions">
          {OFFERING.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <a href="#times" className="button button--primary mt-8">
          See available times
          <Icon name="chevronDown" size={18} />
        </a>
      </div>

      {/* Takes the remaining height; fades in from the top so people never sit hard against the text. */}
      <div className="relative mt-6 min-h-[180px] w-full flex-1 [mask-image:linear-gradient(to_bottom,transparent,black_35%)]">
        <CrowdCanvas src="/images/peeps/all-peeps.png" rows={15} cols={7} />
      </div>
    </section>
  );
}
