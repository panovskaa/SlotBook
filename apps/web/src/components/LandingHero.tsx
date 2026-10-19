import { CrowdCanvas } from './ui/skiper-ui/skiper39';
import { Icon } from './Icon';

/**
 * The landing page's first screen: the headline at the top centre and Skiper UI's walking crowd
 * (skiper39) along the bottom. Scrolling down, or the "See available times" link, reaches the calendar.
 */
export function LandingHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate flex h-[calc(100svh-65px)] min-h-[560px] w-full flex-col items-center overflow-hidden bg-background"
    >
      <div className="hero-text relative z-10 flex flex-col items-center px-[var(--gutter)] pt-16 text-center md:pt-24">
        <h1 id="hero-heading" className="display mx-auto">
          Find a time that works.
        </h1>
        <p className="lede mx-auto">
          Pick an open slot below. Booking takes less than a minute, and you can cancel up to an hour before.
        </p>
        <a href="#times" className="button button--primary mt-8">
          See available times
          <Icon name="chevronDown" size={18} />
        </a>
      </div>

      {/* Fades in from the top, so people never sit hard against the text. */}
      <div className="absolute inset-x-0 bottom-0 -z-10 h-[52%] [mask-image:linear-gradient(to_bottom,transparent,black_35%)]">
        <CrowdCanvas src="/images/peeps/all-peeps.png" rows={15} cols={7} />
      </div>
    </section>
  );
}
