import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import twConfig from "../tailwind.config.js";

export const baseUrl = "https://cdn.webrecorder.net/email-assets";

interface TemplateProps {
  preview: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  disclaimer?: React.ReactNode;
  linky?:
    | {
        version: "hello" | "concerned" | "happy";
        caption: React.ReactNode;
      }
    | false;
}

export const Template = ({
  preview,
  title,
  children,
  disclaimer,
  linky = {
    version: "hello",
    caption: (
      <>
        Linky is glad
        <br /> to see you!
      </>
    ),
  },
}: TemplateProps) => {
  return (
    <Html>
      <Head>
        <Preview>{preview}</Preview>
      </Head>
      <Tailwind config={twConfig}>
        <Body
          className={
            'mx-auto my-auto bg-white px-2 font-sans [font-feature-settings:"ss04"_off,_"ss07"_on,_"ss08"_on]'
          }
        >
          <Container className="mt-[40px] max-w-[672px] rounded-xl border border-stone-600/20 border-solid px-8 py-7">
            <Section className="mt-[32px]">
              <Img
                src={`${baseUrl}/static/browsertrix-icon-color.png`}
                width="48"
                height="48.5"
                alt="Browsertrix"
                className="mx-auto my-0"
              />
            </Section>
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              {title}
            </Heading>

            {children}

            <Text className="text-xs text-stone-500 mb-0 mt-12 max-w-[380px]">
              {disclaimer}
            </Text>
          </Container>
          <Container className="max-w-[672px] py-8">
            <Row>
              <Column align="left" className="align-top">
                <Link
                  href="https://webrecorder.net"
                  style={{ textDecoration: "none" }}
                >
                  <Text className="h-0 text-white m-0">Webrecorder</Text>
                  <Img
                    src={`${baseUrl}/static/webrecorder-lockup-color.png`}
                    alt="Webrecorder"
                    height="16"
                    width="188.3711340206"
                  />
                  <Text className="text-stone-800 font-semibold m-0">
                    Web archiving for all
                  </Text>
                </Link>
              </Column>
              {linky && (
                <Column align="right" className="text-right">
                  <Img
                    src={`${baseUrl}/static/linky-${linky.version}-tiny.jpg`}
                    width="82"
                    height="82"
                    alt="Linky waves hello!"
                    className="ml-auto -mr-4"
                  />
                  <Text className="text-xs text-stone-500 italic mt-0 inline-block text-center">
                    {linky.caption}
                  </Text>
                </Column>
              )}
            </Row>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
