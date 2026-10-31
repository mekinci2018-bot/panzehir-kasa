"use client";

import { useEffect, useRef, useState } from "react";

// A scroll container with a second horizontal scrollbar above it, kept in step with the one at the
// bottom, so a long, wide table can be moved sideways without scrolling down to its end.
export default function CiftKaydirma({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const ust = useRef<HTMLDivElement>(null);
  const alt = useRef<HTMLDivElement>(null);
  const [genislik, setGenislik] = useState(0);
  const [tasiyor, setTasiyor] = useState(false);

  useEffect(() => {
    const a = alt.current;
    if (!a) return;
    const olc = () => {
      setGenislik(a.scrollWidth);
      setTasiyor(a.scrollWidth > a.clientWidth + 1);
    };
    const ro = new ResizeObserver(olc);
    ro.observe(a);
    if (a.firstElementChild) ro.observe(a.firstElementChild);
    olc();
    return () => ro.disconnect();
  }, []);

  // Setting the same scrollLeft fires no event, so the two never echo each other.
  const esitle = (kaynak: HTMLDivElement | null, hedef: HTMLDivElement | null) => {
    if (kaynak && hedef && hedef.scrollLeft !== kaynak.scrollLeft) hedef.scrollLeft = kaynak.scrollLeft;
  };

  return (
    <>
      <div ref={ust} className={`kaydirma-ust print:hidden ${tasiyor ? "" : "hidden"}`} onScroll={() => esitle(ust.current, alt.current)} aria-hidden>
        <div style={{ width: genislik, height: 1 }} />
      </div>
      <div ref={alt} className={className} onScroll={() => esitle(alt.current, ust.current)}>
        {children}
      </div>
    </>
  );
}
