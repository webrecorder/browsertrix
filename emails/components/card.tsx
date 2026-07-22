import { Container, Heading, Link, Text } from "@react-email/components";

export const Card = ({
  title,
  children,
  href,
  linkText,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  href?: string;
  linkText?: React.ReactNode;
}) => {
  if (href) {
    return (
      <Link
        href={href}
        className="block text-black p-4 rounded-lg border border-solid border-stone-600/20 mb-4"
      >
        <Heading as="h3" className="m-0 mb-2">
          {title}
        </Heading>
        <Text className="m-0 text-pretty text-base text-stone-700">
          {children}
        </Text>
        <Text className="mb-0 text-cyan-600">{linkText} &rarr;</Text>
      </Link>
    );
  } else {
    return (
      <Container className="block text-black p-4 rounded-lg border border-solid border-stone-600/20 mb-4">
        <Heading as="h3" className="m-0 mb-2">
          {title}
        </Heading>
        <Text className="m-0 text-pretty text-base text-stone-700">
          {children}
        </Text>
      </Container>
    );
  }
};
