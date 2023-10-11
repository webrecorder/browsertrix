import { zxcvbn, zxcvbnOptions, OptionsType } from "@zxcvbn-ts/core";

const loadOptions = async (): Promise<OptionsType> => {
  const zxcvbnCommonPackage = await import(
    /* webpackChunkName: "zxcvbnCommonPackage" */ "@zxcvbn-ts/language-common"
  );
  const zxcvbnEnPackage = await import(
    /* webpackChunkName: "zxcvbnEnPackage" */ "@zxcvbn-ts/language-en"
  );

  return {
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    translations: zxcvbnEnPackage.translations,
  };
};

export default class PasswordService {
  static options?: any;

  static async setOptions(opts?: OptionsType) {
    if (!PasswordService.options) {
      PasswordService.options = await loadOptions();
    }
    if (opts) {
      zxcvbnOptions.setOptions({
        ...PasswordService.options,
        ...opts,
      });
    } else {
      zxcvbnOptions.setOptions(PasswordService.options);
    }
  }

  static async checkStrength(
    password: string,
    // User input to check, e.g. emails
    userInputs?: string[]
  ) {
    return zxcvbn(password, userInputs);
  }
}
