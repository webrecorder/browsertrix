import {
  ZxcvbnFactory,
  type OptionsType,
  type ZxcvbnResult,
} from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import { mergeDeep } from "immutable";

enum PasswordServiceLanguage {
  English = "en",
}

const DEFAULT_LANGUAGE = PasswordServiceLanguage.English;
const DEFAULT_OPTIONS = {
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
} as const;

const loadOptions = async (
  lang: PasswordServiceLanguage,
): Promise<OptionsType> => {
  const zxcvbnEnPackage = await import(
    /* webpackChunkName: "zxcvbnEnPackage" */ `@zxcvbn-ts/language-${lang}`
  );

  return mergeDeep(DEFAULT_OPTIONS, {
    ...DEFAULT_OPTIONS,
    dictionary: {
      ...zxcvbnEnPackage.dictionary,
    },
    translations: zxcvbnEnPackage.translations,
  });
};

/**
 * Test and estimate password strength
 */
export default class PasswordService {
  static readonly PASSWORD_MINLENGTH = 8 as const;
  static readonly PASSWORD_MAXLENGTH = 64 as const;
  static readonly PASSWORD_MIN_SCORE = 3 as const;

  static options?: Promise<OptionsType> = Promise.resolve(DEFAULT_OPTIONS);
  static lang?: PasswordServiceLanguage;
  static zxcvbn = new ZxcvbnFactory(DEFAULT_OPTIONS);

  static async setLanguage(lang: PasswordServiceLanguage) {
    this.lang = lang;
    this.options = loadOptions(lang);
    this.zxcvbn = new ZxcvbnFactory(await this.options);
  }

  /**
   * @param password
   * @param userInputs Array of personal data to check against
   * @returns {ZxcvbnResult} See https://zxcvbn-ts.github.io/zxcvbn/guide/getting-started/#output
   */
  static async checkStrength(
    password: string,
    // User input to check, e.g. emails
    userInputs?: (string | number)[],
  ): Promise<ZxcvbnResult> {
    if (!this.lang) {
      await this.setLanguage(DEFAULT_LANGUAGE);
    } else {
      await this.options;
    }
    return this.zxcvbn.check(password, userInputs);
  }
}
