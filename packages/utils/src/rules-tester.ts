import { TSESLint } from '@typescript-eslint/experimental-utils';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Temporary solution until v4.0.0 of TypeScript and typescript-eslint
 * See: https://github.com/typescript-eslint/typescript-eslint/issues/2388
 */
declare module 'typescript' {
  type NamedTupleMember = ts.Node;
}

const VALID_PARSERS = [
  '@angular-eslint/template-parser',
  '@typescript-eslint/parser',
] as const;

type RuleTesterConfig = Omit<TSESLint.RuleTesterConfig, 'parser'> & {
  parser: typeof VALID_PARSERS[number];
};

function getFixturesRootDir() {
  return path.join(process.cwd(), 'tests/fixtures/');
}

function isValidParser(
  str: string | undefined = '',
): str is typeof VALID_PARSERS[number] {
  return ((VALID_PARSERS as unknown) as string[]).includes(str);
}

export class RuleTester extends TSESLint.RuleTester {
  private filename: string | undefined = undefined;

  // as of eslint 6 you have to provide an absolute path to the parser
  // but that's not as clean to type, this saves us trying to manually enforce
  // that contributors require.resolve everything
  constructor(options: RuleTesterConfig) {
    super({
      ...options,
      parser: require.resolve(options.parser),
    });

    if (options.parserOptions && options.parserOptions.project) {
      this.filename = path.join(getFixturesRootDir(), 'file.ts');
    }

    // make sure that the parser doesn't hold onto file handles between tests
    // on linux (i.e. our CI env), there can be very a limited number of watch handles available
    afterAll(() => {
      try {
        // instead of creating a hard dependency, just use a soft require
        // a bit weird, but if they're using this tooling, it'll be installed
        require(options.parser).clearCaches();
      } catch {
        // ignored
      }
    });
  }

  // as of eslint 6 you have to provide an absolute path to the parser
  // If you don't do that at the test level, the test will fail somewhat cryptically...
  // This is a lot more explicit
  run<TMessageIds extends string, TOptions extends Readonly<unknown[]>>(
    name: string,
    rule: TSESLint.RuleModule<TMessageIds, TOptions>,
    tests: TSESLint.RunTests<TMessageIds, TOptions>,
  ): void {
    const errorMessage = `Do not set the parser at the test level unless you want to use a parser other than ${VALID_PARSERS.join(
      ', ',
    )}`;

    if (this.filename) {
      // TODO: Make .valid writable in @typescript-eslint/experimental-utils types
      (tests as any).valid = tests.valid.map((test) => {
        if (typeof test === 'string') {
          return {
            code: test,
            filename: this.filename,
          };
        }
        return test;
      });
    }

    tests.valid.forEach((test) => {
      if (typeof test !== 'string') {
        if (isValidParser(test.parser)) {
          throw new Error(errorMessage);
        }
        if (!test.filename) {
          // TODO: Make .filename writable in @typescript-eslint/experimental-utils types
          (test as any).filename = this.filename;
        }
      }
    });
    tests.invalid.forEach((test) => {
      if (isValidParser(test.parser)) {
        throw new Error(errorMessage);
      }
      if (!test.filename) {
        // TODO: Make .filename writable in @typescript-eslint/experimental-utils types
        (test as any).filename = this.filename;
      }
    });

    super.run(name, rule, tests);
  }
}
