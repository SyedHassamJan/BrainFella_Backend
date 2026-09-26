import { QuestionnaireType } from 'src/types/enums';

/**
 * Fixed, standardized screening instruments. Item wording and answer options
 * are the published clinical text — do not reword. Scoring lives in scoring.ts.
 *
 * Sources:
 *  - PHQ-9:   Kroenke, Spitzer & Williams (2001), J Gen Intern Med 16(9).
 *  - GAD-7:   Spitzer, Kroenke, Williams & Löwe (2006), Arch Intern Med 166(10).
 *  - OCI-R:   Foa et al. (2002), Psychological Assessment 14(4).
 *  - DASS-21: Lovibond & Lovibond (1995), Manual for the DASS, 2nd ed.
 */
export interface InstrumentDefinition {
  type: QuestionnaireType;
  name: string;
  measures: string;
  instructions: string;
  options: { value: number; label: string }[];
  items: string[];
}

const frequency2Weeks = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
];

export const INSTRUMENTS: Record<QuestionnaireType, InstrumentDefinition> = {
  PHQ9: {
    type: 'PHQ9',
    name: 'PHQ-9',
    measures: 'Depression symptoms',
    instructions:
      'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    options: frequency2Weeks,
    items: [
      'Little interest or pleasure in doing things',
      'Feeling down, depressed, or hopeless',
      'Trouble falling or staying asleep, or sleeping too much',
      'Feeling tired or having little energy',
      'Poor appetite or overeating',
      'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
      'Trouble concentrating on things, such as reading the newspaper or watching television',
      'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
      'Thoughts that you would be better off dead, or of hurting yourself in some way',
    ],
  },
  GAD7: {
    type: 'GAD7',
    name: 'GAD-7',
    measures: 'Anxiety symptoms',
    instructions:
      'Over the last 2 weeks, how often have you been bothered by the following problems?',
    options: frequency2Weeks,
    items: [
      'Feeling nervous, anxious, or on edge',
      'Not being able to stop or control worrying',
      'Worrying too much about different things',
      'Trouble relaxing',
      'Being so restless that it is hard to sit still',
      'Becoming easily annoyed or irritable',
      'Feeling afraid, as if something awful might happen',
    ],
  },
  OCIR: {
    type: 'OCIR',
    name: 'OCI-R',
    measures: 'Obsessive-compulsive symptoms',
    instructions:
      'The following statements refer to experiences that many people have in their everyday lives. Select the number that best describes how much that experience has DISTRESSED or BOTHERED you during the PAST MONTH.',
    options: [
      { value: 0, label: 'Not at all' },
      { value: 1, label: 'A little' },
      { value: 2, label: 'Moderately' },
      { value: 3, label: 'A lot' },
      { value: 4, label: 'Extremely' },
    ],
    items: [
      'I have saved up so many things that they get in the way.',
      'I check things more often than necessary.',
      'I get upset if objects are not arranged properly.',
      'I feel compelled to count while I am doing things.',
      'I find it difficult to touch an object when I know it has been touched by strangers or certain people.',
      'I find it difficult to control my own thoughts.',
      "I collect things I don't need.",
      'I repeatedly check doors, windows, drawers, etc.',
      'I get upset if others change the way I have arranged things.',
      'I feel I have to repeat certain numbers.',
      'I sometimes have to wash or clean myself simply because I feel contaminated.',
      'I am upset by unpleasant thoughts that come into my mind against my will.',
      'I avoid throwing things away because I am afraid I might need them later.',
      'I repeatedly check gas and water taps and light switches after turning them off.',
      'I need things to be arranged in a particular way.',
      'I feel that there are good and bad numbers.',
      'I wash my hands more often and longer than necessary.',
      'I frequently get nasty thoughts and have difficulty in getting rid of them.',
    ],
  },
  DASS21: {
    type: 'DASS21',
    name: 'DASS-21',
    measures: 'Depression, anxiety and stress',
    instructions:
      'Please read each statement and select a number that indicates how much the statement applied to you over the PAST WEEK.',
    options: [
      { value: 0, label: 'Did not apply to me at all' },
      { value: 1, label: 'Applied to me to some degree, or some of the time' },
      {
        value: 2,
        label:
          'Applied to me to a considerable degree, or a good part of the time',
      },
      { value: 3, label: 'Applied to me very much, or most of the time' },
    ],
    items: [
      'I found it hard to wind down',
      'I was aware of dryness of my mouth',
      "I couldn't seem to experience any positive feeling at all",
      'I experienced breathing difficulty (e.g. excessively rapid breathing, breathlessness in the absence of physical exertion)',
      'I found it difficult to work up the initiative to do things',
      'I tended to over-react to situations',
      'I experienced trembling (e.g. in the hands)',
      'I felt that I was using a lot of nervous energy',
      'I was worried about situations in which I might panic and make a fool of myself',
      'I felt that I had nothing to look forward to',
      'I found myself getting agitated',
      'I found it difficult to relax',
      'I felt down-hearted and blue',
      'I was intolerant of anything that kept me from getting on with what I was doing',
      'I felt I was close to panic',
      'I was unable to become enthusiastic about anything',
      "I felt I wasn't worth much as a person",
      'I felt that I was rather touchy',
      'I was aware of the action of my heart in the absence of physical exertion (e.g. sense of heart rate increase, heart missing a beat)',
      'I felt scared without any good reason',
      'I felt that life was meaningless',
    ],
  },
};
