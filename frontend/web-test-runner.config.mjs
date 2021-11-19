import { importMapsPlugin } from '@web/dev-server-import-maps';

export default {
  plugins: [
    importMapsPlugin({
      inject: {
        importMap: {
          imports: {
            'tailwindcss/tailwind.css': '/src/__mocks__/css.js',
          },
        },
      },
    }),
  ],
};
