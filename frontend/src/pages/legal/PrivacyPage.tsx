import { Link } from 'react-router-dom';
import { LEGAL as L } from '../../legal';
import { LegalLayout, type LegalSection } from './LegalLayout';

const RETENTION: [string, string][] = [
  ['Account details and activity', 'While your account exists.'],
  ['Accounts you delete', `Switched off straight away. You can restore the account within ${L.deletedAccountDays} days by signing up again with the same email. After ${L.deletedAccountDays} days the account, its run history and its learning progress are permanently erased, automatically.`],
  ['Run history', 'Until you delete the run, or your account is erased.'],
  ['Learning progress', 'While your account exists. It is erased together with your account.'],
  ['Content you submit for processing', 'Not kept after your request is finished (apart from the run summaries above).'],
  ['Verification codes', `${L.codeMinutes} minutes.`],
  ['Contact-form messages', `Up to ${L.contactMessageMonths} months, then erased automatically.`],
  ['IP addresses used for spam protection', `Up to ${L.spamIpMinutes} minutes, in memory only.`],
  ['Server logs', `Up to ${L.logDays} days.`],
  ['Accounts disabled for breaking our Terms', 'As long as needed to prevent further misuse, then erased. You can ask us to review this.'],
];

const sections: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          {L.operator} provides the {L.operator} website and services (the <strong>“Service”</strong>) and is
          responsible for your personal data (the data “controller”).
        </p>
        <p>
          You can reach us at any time through our <Link to="/contact">Contact page</Link>. For anything about
          your personal data, choose the subject <strong>“Privacy request”</strong>.
        </p>
      </>
    ),
  },
  {
    id: 'data-we-collect',
    title: 'The data we collect',
    body: (
      <>
        <h3>Data you give us</h3>
        <ul>
          <li><strong>Account details:</strong> your email address, username and password. Your password is stored only as a one-way bcrypt hash, so nobody, including us, can read it.</li>
          <li><strong>Verification codes:</strong> when you sign up, reset your password or delete your account, we email you a 5-digit code. Codes are kept only in server memory, expire after {L.codeMinutes} minutes and allow at most {L.codeAttempts} attempts.</li>
          <li><strong>Messages you send us:</strong> your name, email address, optional subject and message from the Contact form. If you are signed in, we link the message to your account.</li>
          <li><strong>Content you submit for processing:</strong> problem descriptions, files you upload (such as PDF, Word, CSV or text files), code you paste or run, and data you enter (such as numbers, lists, city names or records). We use this content only to produce your result and <strong>do not keep it</strong> once your request is finished, apart from the short run summaries described below. Code you run is executed in a temporary folder that is deleted straight afterwards.</li>
        </ul>

        <h3>Data created when you use the Service</h3>
        <ul>
          <li><strong>Account activity:</strong> when you created your account, when you last signed in, your role (user or administrator), whether your account is active, and when you accepted our Terms of Use and this Privacy Policy, and which version.</li>
          <li><strong>Run history</strong> (signed-in users): a summary of each run, such as the problem type, algorithm, problem size, timings, number of steps and whether the answers were correct, plus a short title that may include a small part of your input (for example, the number you factored or your database query). Benchmarks also keep their measured results. You can view and delete your runs on your Dashboard.</li>
          <li><strong>Learning progress</strong> (signed-in users): which Learn lessons you have finished, your best quiz score, and how many stars you earned in each lesson's game. We use it only to show your progress back to you.</li>
          <li><strong>Technical data:</strong> your IP address, held in memory for up to {L.spamIpMinutes} minutes to protect the Contact form from spam. Our servers may also keep basic logs (IP address, date and time, page requested and errors) for security and troubleshooting.</li>
        </ul>

        <h3>Data stored in your browser</h3>
        <p>
          We <strong>do not use cookies</strong>. We use your browser’s local storage for: a sign-in token that
          keeps you signed in (it expires after {L.tokenDays} days); a copy of your basic profile (username, email
          and role) so pages load quickly; your progress in the circuit builder’s challenge levels; and, if you use the
          Learn lessons without signing in, your progress in them (when you sign in, it moves to your account and is
          removed from the browser). These are strictly necessary for features you ask for, so we do not ask for consent. Signing out removes the
          sign-in token and profile copy, and you can clear everything in your browser settings.
        </p>

        <h3>What we do not do</h3>
        <ul>
          <li>We do not show advertising or use analytics or tracking tools.</li>
          <li>We do not sell or rent your personal data, or profile you for marketing.</li>
          <li>Our pages, fonts and images are served by {L.operator} itself, so visiting the Service does not send your data to other companies.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    title: 'Why we use your data, and our legal bases',
    body: (
      <>
        <ul>
          <li><strong>To create and run your account and provide the features you use.</strong> This is necessary to perform our agreement with you (our Terms of Use).</li>
          <li><strong>To verify your email address and keep your account secure</strong>, for example with verification codes, password hashing and rate limits. This is necessary for our agreement with you and in our legitimate interest in keeping the Service safe.</li>
          <li><strong>To show you your results, run history and learning progress.</strong> Necessary to perform our agreement with you.</li>
          <li><strong>To answer your messages.</strong> Our legitimate interest in responding to you.</li>
          <li><strong>To prevent abuse, investigate problems and enforce our Terms.</strong> Our legitimate interest in protecting the Service and its users.</li>
          <li><strong>To comply with the law</strong> and respond to lawful requests from authorities. A legal obligation.</li>
        </ul>
        <p>
          Where we rely on legitimate interests, we have weighed them against your rights, and you can object at
          any time (see <a href="#your-rights">Your rights</a>). We do not use your data for any purpose that is
          incompatible with the ones above.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share data with',
    body: (
      <>
        <p>
          We share personal data only with service providers who help us run the Service, and only what they
          need. They may use it only on our instructions and must keep it secure.
        </p>
        <ul>
          <li><strong>Hosting and database providers</strong>, which store and run the Service.</li>
          <li><strong>Google (Gmail)</strong>, which sends our verification emails. It receives your email address and the content of the email.</li>
          <li><strong>An AI provider, only if the AI engine is switched on.</strong> When the Code to Quantum tool’s AI engine is enabled, code you submit to it is sent to the AI provider we use (for example Anthropic, or a service compatible with OpenAI’s) to be analysed. The page always shows which engine is active. With the offline engine, your code does not leave our servers.</li>
        </ul>
        <p>We may also disclose personal data:</p>
        <ul>
          <li>if the law, a court order or a lawful request from a public authority requires it;</li>
          <li>to protect the rights, safety or property of our users, {L.operator} or others; or</li>
          <li>as part of a merger, acquisition or sale of all or part of the Service, in which case your data will remain protected by this policy.</li>
        </ul>
        <p><strong>We never sell your personal data.</strong></p>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'International transfers',
    body: (
      <p>
        Our service providers may process data in countries other than the one you live in, including Pakistan,
        the United States and countries in the European Union. Where the law requires it, we rely on appropriate
        safeguards for these transfers, such as standard contractual clauses.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep data',
    body: (
      <>
        <div className="overflow-x-auto mb-3 rounded-xl border border-quantum-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-quantum-800 text-left">
                <th className="px-4 py-2.5 text-gray-300 font-semibold w-2/5">Data</th>
                <th className="px-4 py-2.5 text-gray-300 font-semibold">How long we keep it</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION.map(([what, how]) => (
                <tr key={what} className="border-t border-quantum-700/70 align-top">
                  <td className="px-4 py-2.5 text-gray-300">{what}</td>
                  <td className="px-4 py-2.5 text-gray-400 leading-relaxed">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          We keep data longer than this only where the law requires it, or where it is needed to establish,
          exercise or defend a legal claim.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect your data',
    body: (
      <>
        <ul>
          <li>Passwords are hashed with bcrypt and are never stored in readable form.</li>
          <li>Sign-in tokens expire after {L.tokenDays} days; verification codes expire after {L.codeMinutes} minutes and allow a limited number of attempts.</li>
          <li>Only approved administrator accounts can open the admin area.</li>
          <li>Code you run is executed in an isolated sandbox with strict time and memory limits.</li>
          <li>Data travels over encrypted (HTTPS) connections.</li>
        </ul>
        <p>
          No method of sending or storing data is completely secure. If a data breach affects your personal data,
          we will notify you and the relevant authorities without undue delay, where the law requires it.
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li><strong>Access</strong> your personal data and get a copy of it.</li>
          <li><strong>Correct</strong> inaccurate data. You can change your username in <Link to="/account">Account settings</Link>; contact us for anything else.</li>
          <li><strong>Delete</strong> your data. You can delete your account at any time in Account settings (it is erased after {L.deletedAccountDays} days), or ask us to erase your data sooner.</li>
          <li><strong>Receive your data</strong> in a common, machine-readable format (data portability).</li>
          <li><strong>Object to, or ask us to restrict,</strong> processing based on our legitimate interests.</li>
          <li><strong>Withdraw consent</strong>, where we rely on it.</li>
          <li><strong>Complain</strong> to the data-protection authority in your country.</li>
        </ul>
        <p>
          To use these rights, go to Account settings or send us a message through the <Link to="/contact">Contact
          page</Link> with the subject “Privacy request”. We may need to confirm it is really you, usually with a
          code sent to your account email. We reply within {L.responseDays} days; if we need longer, where the law
          allows it, we will tell you why. Requests are free unless they are clearly unfounded or excessive.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        The Service is for people aged {L.minimumAge} and over. If you are under 18, you need permission from a
        parent or guardian to use it. We do not knowingly collect personal data from children under{' '}
        {L.minimumAge}. If you believe a child under {L.minimumAge} has given us personal data, please contact us
        and we will delete it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this Privacy Policy from time to time. The date at the top shows when the current version
        took effect. If we make significant changes, we will tell you before they take effect, through a notice on
        the Service or by email.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        Questions about this policy or your personal data? Send us a message through our{' '}
        <Link to="/contact">Contact page</Link> with the subject “Privacy request”.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro={
        <p>
          This Privacy Policy explains what personal data {L.operator} (<strong>“we”</strong>,{' '}
          <strong>“us”</strong>) collects when you use the Service, why we collect it, how long we keep it, who we
          share it with and the rights you have. We have written it in plain language; if anything is unclear,
          please <Link to="/contact">contact us</Link>.
        </p>
      }
      sections={sections}
    />
  );
}
