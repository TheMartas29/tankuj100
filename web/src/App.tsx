import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Features from "./components/Features";
import Showcase from "./components/Showcase";
import OlderCars from "./components/OlderCars";
import Faq from "./components/Faq";
import FinalCta from "./components/FinalCta";
import Footer from "./components/Footer";

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <OlderCars />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
