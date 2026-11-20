import { useMemo, useState } from "react";

import ModuleNav from "../components/ModuleNav";
import {
  ArrowRightIcon,
  BookIcon,
  ChevronDownIcon,
  FileTextIcon,
  HelpIcon,
  MailIcon,
  PhoneIcon,
  SearchIcon,
  SupportIcon,
} from "../components/Icons";
import "./ModulePages.css";

const FAQS = [
  {
    question: "How do I process a refund?",
    answer: "Open Reversals from the POS navigation, find the order, and choose Reverse. Enter a reason and confirm that any external refund has been handled manually. The POS records the reversal and audit details; no payment gateway is connected to automatically send money back.",
  },
  {
    question: "How do I close a shift?",
    answer: "Open Shifts, choose End Shift on your active shift, review sales and payments, count notes in the Cash Denomination Counter, then confirm. The system compares expected vs actual cash, saves the closing report, and lets you print it.",
  },
  {
    question: "How do I view past orders?",
    answer: "Open Orders to search by order ID, customer, or item. Use the channel, payment, and date filters to narrow the results. View Order opens the saved database record and its line items.",
  },
  {
    question: "How do I change printer settings?",
    answer: "Open Settings → Printer Settings to configure the browser printer, paper width, and copy count. Printing opens the standard browser print dialog; direct USB or network printing needs a local print agent, which is not installed in this deployment.",
  },
  {
    question: "What do I do if the system is slow?",
    answer: "Check the network connection, use Refresh to reload the current data, and retry after the database connection is restored. If the problem persists, send support the screen name, approximate time, and any visible error message.",
  },
  {
    question: "Can I change my role in Profile Settings?",
    answer: "No. A manager assigns roles and permissions. You can update your own display name and email address, but cannot grant yourself manager or refund permissions.",
  },
  {
    question: "Why does my refund show as recorded but not paid?",
    answer: "The POS creates an audited reversal record but this installation has no payment-gateway refund integration. For card or online payments, process the refund through the original provider and retain its reference.",
  },
  {
    question: "How are shift cash totals calculated?",
    answer: "Expected cash starts from the opening float, adds cash received, subtracts recorded cash refunds and cash pulls, and is compared with the cash counted when the shift is closed.",
  },
  {
    question: "How can I print a receipt again?",
    answer: "Find the order in Order Management and choose the printer icon. The receipt is populated from the saved order and opened in the browser's print dialog.",
  },
];

const GUIDE_STEPS = [
  "Start at Till and add products to the current order. Confirm channel and payment details before printing.",
  "Use Orders to review saved orders, record payments, move order status forward, or print a receipt.",
  "Use Reversals only for eligible sales. Enter a clear reason and complete any external refund separately.",
  "Open a Shift with the real drawer opening cash. At close, count the drawer and compare the expected cash with the actual amount.",
  "Settings controls your profile, display preferences, printer, and sign-in PIN. Manager-only business configuration stays in the Admin panel.",
];

function Help() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const [showAll, setShowAll] = useState(false);

  const filteredFaqs = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const matches = term
      ? FAQS.filter(({ question, answer }) => `${question} ${answer}`.toLocaleLowerCase().includes(term))
      : FAQS;
    return showAll || term ? matches : matches.slice(0, 5);
  }, [query, showAll]);

  const toggleFaq = (index) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const openGuide = () => document.getElementById("user-guide")?.scrollIntoView({ behavior: "smooth" });
  const openFaqs = () => document.getElementById("faqs")?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      <ModuleNav />
      <main className="mp-help">
        <section className="mp-help-hero">
          <div className="module-title-icon"><SupportIcon /></div>
          <div>
            <h1>Help Center</h1>
            <p>Find answers, get support, and make the most out of Lexcore Solutions POS.</p>
          </div>
          <div className="mp-help-illustration" aria-hidden="true">
            <div className="mp-help-laptop"><span>ϟ Lexcore</span></div>
            <span className="mp-help-bubble mp-help-bubble--question">?</span>
            <span className="mp-help-bubble mp-help-bubble--chat">•••</span>
            <span className="mp-help-leaf">⌁</span>
          </div>
        </section>

        <label className="mp-help-search">
          <SearchIcon />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for help… (e.g. How to process a refund?)" aria-label="Search help articles and FAQs" />
          <button type="button" className="om-btn om-btn--primary" onClick={openFaqs}><SearchIcon className="om-btn-icon" /> Search</button>
        </label>

        <section className="mp-help-links" aria-label="Help shortcuts">
          <button type="button" className="mp-help-link" onClick={openGuide}><BookIcon /><span><b>User Guide</b><small>Learn how to use the POS</small></span><ArrowRightIcon /></button>
          <button type="button" className="mp-help-link" onClick={openFaqs}><FileTextIcon /><span><b>FAQs</b><small>Find quick answers</small></span><ArrowRightIcon /></button>
        </section>

        <div className="mp-help-content">
          <section className="mp-help-faqs" id="faqs">
            <h2 className="mp-help-section-title"><span><HelpIcon /> Frequently Asked Questions</span><button type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer" : "View All FAQs"} <ArrowRightIcon /></button></h2>
            <div className="mp-help-faq-list">
              {filteredFaqs.length ? filteredFaqs.map(({ question, answer }) => {
                const index = FAQS.findIndex((faq) => faq.question === question);
                const isOpen = expanded.has(index);
                return (
                  <article className="mp-help-faq" key={question}>
                    <button type="button" aria-expanded={isOpen} onClick={() => toggleFaq(index)}>
                      <span>{question}</span><ChevronDownIcon />
                    </button>
                    {isOpen ? <p>{answer}</p> : null}
                  </article>
                );
              }) : <p className="mp-help-empty">No help articles match “{query}”. Try another search term or contact support.</p>}
            </div>
          </section>

          <aside className="mp-help-support" id="support">
            <h2 className="mp-help-section-title"><span><SupportIcon /> Need More Help?</span></h2>
            <p className="mp-help-support-intro">Contact the support team using the available channels.</p>
            <a className="mp-help-contact" href="mailto:lexcoresolutions@gmail.com?subject=Amoons%20POS%20Support">
              <MailIcon /><span>Email Support<small>lexcoresolutions@gmail.com</small></span><ArrowRightIcon />
            </a>
            <a className="mp-help-contact" href="tel:+923202100438">
              <PhoneIcon /><span>Call Us<small>+92 320 210 0438</small></span><ArrowRightIcon />
            </a>
            <a className="mp-help-contact" href="https://wa.me/923202100438?text=Hello%2C%20I%20need%20help%20with%20Amoons%20POS." target="_blank" rel="noreferrer">
              <SupportIcon /><span>Live Chat<small>Continue in WhatsApp</small></span><span className="mp-chat-now">Chat Now</span>
            </a>
            <p className="mp-support-unavailable">Live chat opens WhatsApp; an in-app chat service is not configured.</p>
          </aside>
        </div>

        <section className="mp-help-guide" id="user-guide">
          <h2 className="mp-help-section-title"><span><BookIcon /> User Guide</span></h2>
          <ol>{GUIDE_STEPS.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>
      </main>
    </>
  );
}

export default Help;
