import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ReshapingSection from "@/components/ReshapingSection";
import SolutionsSection from "@/components/SolutionsSection";
import InvestmentSection from "@/components/InvestmentSection";
import PartnersSection from "@/components/PartnersSection";
import TeamSection from "@/components/TeamSection";
import CtaSection from "@/components/CtaSection";
import PumpSection from "@/components/PumpSection";
import Footer from "@/components/Footer";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <ReshapingSection />
        <SolutionsSection />
        <InvestmentSection />
        <PartnersSection />
        <TeamSection />
        <PumpSection />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
