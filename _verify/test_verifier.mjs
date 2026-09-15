/*
 * test_verifier.mjs — the OLD "Scam Link Verifier" predicate, measured.
 *
 * The predicate below is copied VERBATIM from the shipped govdocs_studio build
 * (index.html lines 565-618), so this measures the real behaviour, not a
 * paraphrase.
 *
 * WHAT THIS SUITE IS FOR
 * It is not testing a working feature — it is preserving the evidence that the
 * old feature did not work, so the finding in CODE_REVIEW_AND_PLAN.html stays
 * reproducible. A claim in a report that nobody can re-run is an opinion.
 *
 * So the assertions are inverted on purpose: they fail if the reproduction ever
 * starts looking correct. That would mean the predicate drifted from the shipped
 * source, and the evidence in the report is no longer about the real build.
 */
function analyse(input) {
  let urlStr = input;
  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'http://' + urlStr;
  }
  const url = new URL(urlStr);
  const hostname = url.hostname;
  const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);

  const warnings = [];
  if (isIp) warnings.push('IP_LITERAL');
  if (url.protocol !== 'https:') warnings.push('NOT_HTTPS');

  // ---- verbatim lookalike block from the shipped code ----
  const targets = ['sbi', 'hdfc', 'icici', 'axis', 'pnb', 'epfo', 'incometax'];
  let typo = false;
  targets.forEach((t) => {
    if (
      hostname.includes(t) &&
      !hostname.endsWith('.gov.in') &&
      !hostname.endsWith('.co.in') &&
      !hostname.endsWith('.com')
    ) {
      typo = true;
    }
  });
  if (typo || hostname.split('.').length > 4) warnings.push('LOOKALIKE');
  // --------------------------------------------------------

  return { hostname, warnings };
}

/*
 * [input, shouldFlag, note] — shouldFlag is what a correct verifier must do.
 *
 * Every case is https on purpose. An http URL also trips the NOT_HTTPS branch,
 * which would flag a dangerous site for the wrong reason and hide whether the
 * LOOKALIKE logic works at all. Isolating one predicate is the only way to show
 * which one is broken.
 */
const CASES = [
  ['https://echallan.parivahan.gov.in/', false, 'genuine gov.in'],
  ['https://onlinesbi.sbi/', false, 'legit SBI short domain'],
  ['https://www.onlinesbi.sbi/', false, 'legit SBI short domain'],
  ['https://sbi.co.in/', false, 'legit SBI'],
  ['https://www.sbicard.com/', false, 'legit SBI Card'],
  ['https://incometax.gov.in/', false, 'genuine'],
  ['https://bit.ly/3xYzAbC', true, 'SHORTENER — kickstart says RED ALERT'],
  ['https://tinyurl.com/challan-pay', true, 'SHORTENER — kickstart says RED ALERT'],
  ['https://echallan-pay.xyz/pay', true, 'phishing .xyz — kickstart says RED ALERT'],
  ['https://echallan-pay.top/pay', true, 'phishing .top — kickstart says RED ALERT'],
  ['https://epfo.gov.in.verify-kyc.com/login', true, 'subdomain-suffix phishing'],
  ['https://sbi-online-kyc-update.com/login', true, 'typosquat ending in .com — the blind spot'],
  ['https://192.168.1.1/login', true, 'raw IP'],
  ['https://sbi.secure-login.verify-account.info/', true, 'nested phishing'],
  ['https://incometax-refund-claim.xyz/', true, 'phishing'],
];

console.log('input'.padEnd(46) + '| hostname'.padEnd(34) + '| verdict');
console.log('-'.repeat(120));

const falsePositives = [];  // a genuine site wrongly flagged
const falseNegatives = [];  // a dangerous site passed as clean

for (const [input, shouldFlag, note] of CASES) {
  let out;
  try {
    out = analyse(input);
  } catch (e) {
    out = { hostname: '<threw: ' + e.message + '>', warnings: [] };
  }
  const flagged = out.warnings.length > 0;
  let verdict;
  if (flagged === shouldFlag) verdict = `correct (${flagged ? 'flagged' : 'clean'})`;
  else if (flagged) { verdict = '*** WRONG: FALSE POSITIVE ***'; falsePositives.push(out.hostname); }
  else { verdict = '*** WRONG: FALSE NEGATIVE ***'; falseNegatives.push(out.hostname); }

  console.log(input.padEnd(46) + '| ' + out.hostname.padEnd(32) + '| ' + verdict + '   <- ' + note);
}
console.log('-'.repeat(120));

const correct = CASES.length - falsePositives.length - falseNegatives.length;
console.log(`  correct: ${correct}/${CASES.length}`);
console.log(`  FALSE POSITIVES (genuine sites flagged): ${falsePositives.length}  ${falsePositives.join(', ')}`);
console.log(`  FALSE NEGATIVES (dangerous sites passed): ${falseNegatives.length}  ${falseNegatives.join(', ')}`);
console.log('');

let failures = 0;
const assert = (label, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

console.log('The reproduction must still show the old build\'s defects:');
assert('the predicate wrongly flags genuine sites (false positives)',
  falsePositives.length === 2, `${falsePositives.length} found`);
assert('the predicate passes dangerous sites as clean (false negatives)',
  falseNegatives.length === 5, `${falseNegatives.length} found`);
assert('the predicate gets 7 of its 15 cases wrong',
  falsePositives.length + falseNegatives.length === 7,
  `${falsePositives.length + falseNegatives.length} of ${CASES.length} wrong`);
assert('the two SBI short domains are wrongly flagged',
  falsePositives.includes('onlinesbi.sbi') && falsePositives.includes('www.onlinesbi.sbi'));
assert('every shortener and .xyz/.top domain is wrongly passed',
  ['bit.ly', 'tinyurl.com', 'echallan-pay.xyz', 'echallan-pay.top']
    .every((h) => falseNegatives.includes(h)));

console.log('');
console.log('='.repeat(62));
console.log(failures
  ? `${failures} assertion(s) FAILED — the reproduction has drifted from the shipped source`
  : 'the old predicate still reproduces its defects, so the report\'s evidence holds');
console.log('='.repeat(62));

process.exit(failures === 0 ? 0 : 1);
