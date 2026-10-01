import { Link } from 'react-router-dom';
import { LEGAL as L } from '../../legal';
import { LegalLayout, type LegalSection } from './LegalLayout';

const sections: LegalSection[] = [
  {
    id: 'who-can-use',
    title: 'Who can use QAIbridge',
    body: (
      <ul>
        <li>You must be at least <strong>{L.minimumAge} years old</strong>.</li>
        <li>If you are under 18, you need permission from a parent or guardian. They accept these Terms on your behalf and are responsible for your use of the Service.</li>
        <li>You must not be barred from using the Service under the laws that apply to you.</li>
        <li>If you use the Service for an organisation, you confirm that you are allowed to accept these Terms on its behalf.</li>
      </ul>
    ),
  },
  {
    id: 'your-account',
    title: 'Your account',
    body: (
      <ul>
        <li>Give accurate information when you sign up, and keep your email address up to date.</li>
        <li>Keep your password secret. Do not share your account; each account is for one person.</li>
        <li>You are responsible for everything done through your account.</li>
        <li>Tell us straight away through the <Link to="/contact">Contact page</Link> if you think someone has used your account without permission.</li>
        <li>We may refuse or change a username that is offensive, misleading or pretends to be someone else.</li>
      </ul>
    ),
  },
  {
    id: 'the-service',
    title: 'The Service',
    body: (
      <ul>
        <li>{L.operator} provides tools to learn about, simulate and compare quantum and classical algorithms. <strong>Quantum computations are simulated on ordinary computers</strong>; they do not run on quantum hardware.</li>
        <li>The Service is currently free. If we introduce paid features, we will tell you in advance, and you will pay only if you choose them.</li>
        <li>We may change, add or remove features, set usage limits (for example on problem sizes or how many simulations can run at once), or suspend or end the Service. Where reasonable, we will give you notice.</li>
        <li>We do not promise that the Service will be uninterrupted, error-free or available at any particular time.</li>
      </ul>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You must not:</p>
        <ul>
          <li>break any law, including Pakistan’s Prevention of Electronic Crimes Act, 2016, or help anyone else to do so;</li>
          <li>access, or try to access, accounts, data or systems you are not authorised to use, or test or scan the Service’s security without our written permission;</li>
          <li>try to escape, disable or get around the code sandbox, usage limits or any other security measure;</li>
          <li>overload or disrupt the Service, for example with excessive automated requests, scraping or denial-of-service attacks;</li>
          <li>upload or run malware or other harmful code, or use the Service to mine cryptocurrency;</li>
          <li>submit anything illegal, anything that infringes someone else’s rights (including intellectual property and privacy), or other people’s personal data without their permission;</li>
          <li>send spam through the Contact form, or harass anyone;</li>
          <li>pretend to be someone else or misrepresent your connection with anyone;</li>
          <li>copy, resell or commercially exploit the Service or its software, except as these Terms allow, or reverse-engineer it except where the law permits; or</li>
          <li>present results from the Service as if they came from real quantum hardware.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'your-content',
    title: 'Your content',
    body: (
      <ul>
        <li>“Your content” means the descriptions, files, code, data and messages you submit to the Service.</li>
        <li><strong>You keep all rights to your content.</strong></li>
        <li>You allow us to host, process and display your content only as needed to provide the Service to you and keep it secure, as described in our <Link to="/privacy">Privacy Policy</Link>. This permission ends when your content is deleted.</li>
        <li>You confirm that you have the right to submit your content and that it does not break these Terms or the law.</li>
        <li>Please do not submit confidential or sensitive information, such as passwords, bank details or health information. The Service does not need it.</li>
      </ul>
    ),
  },
  {
    id: 'our-content',
    title: 'Our content and intellectual property',
    body: (
      <ul>
        <li>The Service, including its software, design, text, graphics, logo and the name “{L.operator}”, belongs to {L.operator} or its licensors and is protected by intellectual-property laws.</li>
        <li>We give you a personal, limited, non-exclusive, non-transferable and revocable right to use the Service for learning, research or your organisation’s internal purposes, in line with these Terms.</li>
        <li><strong>Your results are yours to use.</strong> You may use the outputs generated for you, such as numbers, charts and exported Qiskit code, in your own work and publications. We appreciate a mention of {L.operator} where reasonable.</li>
        <li>If you send us ideas or feedback, we may use them freely, without any obligation to you.</li>
        <li>Parts of the Service use open-source software under its own licences. IBM and Qiskit are trademarks of International Business Machines Corporation; {L.operator} is not affiliated with or endorsed by IBM.</li>
      </ul>
    ),
  },
  {
    id: 'no-advice',
    title: 'Results are not professional advice',
    body: (
      <ul>
        <li>All results are simulations for education and research. They can contain errors and may differ from what real quantum hardware would produce.</li>
        <li>Recommendations, such as those from the AI Advisor, are estimates, not guarantees.</li>
        <li>Nothing on the Service is financial, investment, legal, engineering, security or other professional advice. Example data, such as the stock figures in the portfolio example, is for illustration only.</li>
        <li>Do not rely on the Service for decisions where a mistake could cause harm or loss; check results independently.</li>
      </ul>
    ),
  },
  {
    id: 'third-parties',
    title: 'Third-party services',
    body: (
      <p>
        The Service relies on other companies, for example for hosting, for sending email (Google’s Gmail) and,
        when it is switched on, for the AI engine. We are not responsible for services we do not control, and your
        use of them may also be covered by their own terms. Our <Link to="/privacy">Privacy Policy</Link> explains
        what data they receive.
      </p>
    ),
  },
  {
    id: 'disclaimer',
    title: 'Disclaimer',
    body: (
      <p>
        To the fullest extent permitted by law, the Service is provided <strong>“as is” and “as available”</strong>,
        without warranties of any kind, whether express or implied, including warranties of accuracy, fitness for a
        particular purpose, merchantability and non-infringement. This does not affect any rights you have under
        laws that cannot be excluded, such as consumer-protection laws.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p>To the fullest extent permitted by law:</p>
        <ul>
          <li>{L.operator} is not liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, revenue, data, goodwill or business opportunities, arising from or related to your use of, or inability to use, the Service; and</li>
          <li>our total liability for all claims relating to the Service is limited to the greater of (a) the amount you paid us for the Service in the 12 months before the claim, and (b) {L.liabilityCap}.</li>
        </ul>
        <p>
          Nothing in these Terms limits or excludes liability that cannot be limited or excluded by law, including
          liability for fraud, or for death or personal injury caused by negligence.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: (
      <p>
        To the extent permitted by law, you agree to compensate {L.operator} for any claims, losses and expenses
        (including reasonable legal fees) that arise from your breach of these Terms, your content, or your misuse
        of the Service.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and termination',
    body: (
      <ul>
        <li>You can stop using the Service and delete your account at any time in <Link to="/account">Account settings</Link>. You can restore a deleted account within {L.deletedAccountDays} days by signing up again with the same email; after that it is permanently erased (see our <Link to="/privacy">Privacy Policy</Link>).</li>
        <li>We may suspend or disable your account, or limit your access, if you break these Terms, if the law requires it, or to protect the Service, its users or others. Where appropriate we will tell you why; if you think we have made a mistake, please contact us.</li>
        <li>Sections that by their nature should continue after your account ends, including Your content, Our content and intellectual property, Results are not professional advice, Disclaimer, Limitation of liability, Indemnity, and Governing law and disputes, will continue to apply.</li>
      </ul>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these Terms',
    body: (
      <p>
        We may update these Terms, for example to reflect new features or legal requirements. We will publish the
        new version with a new effective date and, for significant changes, tell you in advance through a notice on
        the Service or by email. If you keep using the Service after the changes take effect, you accept the new
        Terms. If you do not agree, please stop using the Service and delete your account.
      </p>
    ),
  },
  {
    id: 'governing-law',
    title: 'Governing law and disputes',
    body: (
      <ul>
        <li>These Terms, and any dispute arising out of or in connection with them or the Service, are governed by the laws of the <strong>Islamic Republic of Pakistan</strong>.</li>
        <li>Before starting any formal claim, please contact us so we can try to resolve the issue informally. We aim to reply within {L.responseDays} days.</li>
        <li>Subject to any mandatory rights you have where you live, the courts at <strong>Islamabad, Pakistan</strong>, have exclusive jurisdiction.</li>
        <li>If you are a consumer living in another country, you keep the protection of the mandatory consumer laws of your country, and you may also be able to bring a claim in your local courts.</li>
      </ul>
    ),
  },
  {
    id: 'general',
    title: 'General',
    body: (
      <ul>
        <li><strong>Entire agreement:</strong> these Terms and our Privacy Policy are the whole agreement between you and us about the Service.</li>
        <li><strong>Severability:</strong> if any part of these Terms is found to be unenforceable, the rest stays in effect.</li>
        <li><strong>No waiver:</strong> if we do not enforce a right straight away, we have not given it up.</li>
        <li><strong>Transfer:</strong> you may not transfer your rights under these Terms. We may transfer ours as part of a reorganisation, merger or sale of the Service, and will tell you if we do.</li>
        <li><strong>Events beyond our control:</strong> we are not responsible for delays or failures caused by events outside our reasonable control.</li>
        <li><strong>Language:</strong> if these Terms are translated, the English version prevails.</li>
      </ul>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        Questions about these Terms? Send us a message through our <Link to="/contact">Contact page</Link>.
      </p>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      intro={
        <>
          <p>
            These Terms of Use (<strong>“Terms”</strong>) are an agreement between you and {L.operator}{' '}
            (<strong>“we”</strong>, <strong>“us”</strong>) for using the {L.operator} website and services
            (the <strong>“Service”</strong>).
          </p>
          <p>
            By creating an account or using the Service, you agree to these Terms and confirm that you have read
            our <Link to="/privacy">Privacy Policy</Link>. If you do not agree, please do not use the Service.
          </p>
        </>
      }
      sections={sections}
    />
  );
}
