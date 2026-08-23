"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";

type TeamMember = {
  id?: number;
  initials: string;
  name: string;
  role: string;
  tags: string[];
};

type TeamApiResponse = {
  items?: Array<{
    id: number;
    name: string;
    role: string;
    tags: string[];
  }>;
};

type ApiMembersState = {
  locale: string;
  items: TeamMember[];
};

export default function TeamSection() {
  const t = useTranslations("team");
  const locale = useLocale();

  const fallbackMembers: TeamMember[] = [
    {
      initials: t("member1Initials"),
      name: t("member1Name"),
      role: t("member1Role"),
      tags: t("member1Tags").split(","),
    },
    {
      initials: t("member2Initials"),
      name: t("member2Name"),
      role: t("member2Role"),
      tags: t("member2Tags").split(","),
    },
    {
      initials: t("member3Initials"),
      name: t("member3Name"),
      role: t("member3Role"),
      tags: t("member3Tags").split(","),
    },
    {
      initials: t("member4Initials"),
      name: t("member4Name"),
      role: t("member4Role"),
      tags: t("member4Tags").split(","),
    },
    {
      initials: t("member5Initials"),
      name: t("member5Name"),
      role: t("member5Role"),
      tags: t("member5Tags").split(","),
    },
    {
      initials: t("member6Initials"),
      name: t("member6Name"),
      role: t("member6Role"),
      tags: t("member6Tags").split(","),
    },
    {
      initials: t("member7Initials"),
      name: t("member7Name"),
      role: t("member7Role"),
      tags: t("member7Tags").split(","),
    },
    {
      initials: t("member8Initials"),
      name: t("member8Name"),
      role: t("member8Role"),
      tags: t("member8Tags").split(","),
    },
  ];

  // API payload is accepted only when it matches the active locale and is non-empty.
  // Otherwise render the current locale's static fallback (avoids stale cross-locale data).
  const [apiMembers, setApiMembers] = useState<ApiMembersState | null>(null);
  const members =
    apiMembers &&
    apiMembers.locale === locale &&
    apiMembers.items.length > 0
      ? apiMembers.items
      : fallbackMembers;

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.bitbt.com";

    fetch(`${apiUrl}/api/team?locale=${locale}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load team");
        return response.json() as Promise<TeamApiResponse>;
      })
      .then((data) => {
        if (!Array.isArray(data.items) || data.items.length === 0) {
          setApiMembers({ locale, items: [] });
          return;
        }
        setApiMembers({
          locale,
          items: data.items.map((member) => {
            const fallback = fallbackMembers.find((item) => item.name === member.name);
            const generatedInitials = member.name
              .split(/\s+/)
              .filter(Boolean)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return {
              ...member,
              initials: fallback?.initials || generatedInitials || "?",
              tags: Array.isArray(member.tags) ? member.tags : [],
            };
          }),
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setApiMembers({ locale, items: [] });
      });

    return () => controller.abort();
    // The translated fallback changes whenever the locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  return (
    <section className="py-[60px] md:py-[120px] border-b border-[#e5e5e5]" id="team">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8">
        {/* Section label */}
        <p className="text-[11px] text-[#aaa] font-medium tracking-[0.1em]">{t("label")}</p>

        {/* Title */}
        <h2 className="mt-5 text-[32px] md:text-[52px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#1a1a1a]">
          {t("title")}
        </h2>

        {/* Team cards */}
        <div className="mt-10 md:mt-[56px] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {members.map((member, i) => (
            <div
              key={i}
              className="bg-white border border-[#e5e5e5] rounded-2xl px-6 py-8"
            >
              {/* Avatar */}
              <div className="w-12 h-12 bg-[#f0f0f0] border border-[#e5e5e5] rounded-xl flex items-center justify-center">
                <span className="text-[15px] font-bold text-[#1a1a1a] tracking-[-0.15px]">{member.initials}</span>
              </div>

              {/* Info */}
              <div className="mt-5">
                <h3 className="text-xl font-bold text-[#1a1a1a] tracking-[-0.5px]">{member.name}</h3>
                <p className="text-xs text-[#aaa] font-medium tracking-[0.48px] mt-1.5">{member.role}</p>
                {/* Separator */}
                <div className="h-px bg-[#f0f0f0] mt-5" />
                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mt-[18px]">
                  {member.tags.map((tag, j) => (
                    <span
                      key={j}
                      className="text-[11px] text-[#6b6b6b] font-medium bg-[#f0f0f0] border border-[#e8e8e8] px-2.5 py-1 rounded-[6px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
