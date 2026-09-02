import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { formatBytes } from "@/lib/format";
import type { PdfBlock, PdfModel, PdfSection } from "./model";

/**
 * The printed application, laid out the way STN 023 R5 reads: a titled sheet,
 * particulars in a bordered label/value grid, every list as a numbered table,
 * and a signature line closing each part.
 *
 * The literal sizes and colours here are the same exception `lib/mail/` is:
 * `@react-pdf/renderer` has its own stylesheet implementation and can no more
 * read `globals.css` than an email client can. Everything a reader would call
 * "the theme" is defined once below rather than sprinkled through the tree.
 */

// The renderer hyphenates by default, which reads as a typo on a form full of
// short labels ("publi-cations"). Words wrap whole instead.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#111111";
const MUTED = "#555555";
const RULE = "#999999";
const HEAD_FILL = "#eeeeee";

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
  },

  masthead: { marginBottom: 14, textAlign: "center" },
  institute: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  instituteSub: { fontSize: 7.5, color: MUTED, marginTop: 2 },
  title: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10 },
  reference: { fontSize: 8.5, color: MUTED, marginTop: 3 },

  partHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: INK,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 3,
  },
  note: { fontSize: 8, color: MUTED, marginBottom: 4 },
  blockLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginBottom: 3 },

  table: {
    borderWidth: 1,
    borderColor: RULE,
    borderBottomWidth: 0,
    marginBottom: 8,
  },
  row: { flexDirection: "row" },
  headRow: { backgroundColor: HEAD_FILL },
  cell: {
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    borderRightWidth: 1,
    borderRightColor: RULE,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  lastCell: { borderRightWidth: 0 },
  headCell: { fontFamily: "Helvetica-Bold" },
  labelCell: { width: "32%", backgroundColor: HEAD_FILL },
  valueCell: { width: "68%" },
  indexCell: { width: 26, textAlign: "center" },
  empty: { color: MUTED, fontSize: 8, marginBottom: 8 },

  attachment: { flexDirection: "row", marginBottom: 2 },
  attachmentName: { flexGrow: 1 },
  attachmentMeta: { color: MUTED },
  thumbnail: {
    marginTop: 4,
    marginBottom: 8,
    maxHeight: 220,
    objectFit: "contain",
  },

  signature: {
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: RULE,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signatureText: { fontSize: 8.5 },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: MUTED,
  },
});

export type ApplicationPdfProps = {
  model: PdfModel;
  /** Data URIs for the attachments that can be shown inline, by file id. */
  images: Record<string, string>;
};

export function ApplicationPdf({ model, images }: ApplicationPdfProps) {
  return (
    <Document
      title={`${model.reference} - ${model.title}`}
      author="MIT Promotion Application Portal"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.masthead}>
          <Text style={styles.institute}>MANIPAL</Text>
          <Text style={styles.instituteSub}>
            ACADEMY OF HIGHER EDUCATION · Institution of Eminence Deemed to be
            University
          </Text>
          <Text style={styles.title}>{model.title}</Text>
          <Text style={styles.reference}>
            {model.reference} · {model.applicantLine} · {model.status}
          </Text>
        </View>

        {model.parts.map((part, index) => (
          <View key={`${part.title}-${index}`}>
            <Text style={styles.partHeading}>{part.title}</Text>
            {part.description ? (
              <Text style={styles.note}>{part.description}</Text>
            ) : null}

            {part.sections.map((section, sectionIndex) => (
              <Section
                key={`${section.title}-${sectionIndex}`}
                section={section}
                images={images}
              />
            ))}

            <View style={styles.signature}>
              <Text style={styles.signatureText}>
                {part.signature ? `Date: ${part.signature.at}` : "Date:"}
              </Text>
              <Text style={styles.signatureText}>
                {part.signature
                  ? `Signed: ${part.signature.name}`
                  : "Signature:"}
              </Text>
            </View>
          </View>
        ))}

        {model.attachments.length > 0 ? (
          <View break>
            <Text style={styles.partHeading}>Enclosures</Text>
            <Text style={styles.note}>
              Documents uploaded with this application. Those that are
              themselves PDFs follow this page in the order listed.
            </Text>
            <View style={styles.table}>
              <View style={[styles.row, styles.headRow]}>
                <Text style={[styles.cell, styles.indexCell, styles.headCell]}>
                  SN
                </Text>
                <Text style={[styles.cell, styles.headCell, { flexGrow: 1 }]}>
                  File
                </Text>
                <Text
                  style={[
                    styles.cell,
                    styles.lastCell,
                    styles.headCell,
                    { width: 80 },
                  ]}
                >
                  Size
                </Text>
              </View>
              {model.attachments.map((file, index) => (
                <View key={file.id} style={styles.row}>
                  <Text style={[styles.cell, styles.indexCell]}>
                    {index + 1}
                  </Text>
                  <Text style={[styles.cell, { flexGrow: 1 }]}>
                    {file.name}
                  </Text>
                  <Text style={[styles.cell, styles.lastCell, { width: 80 }]}>
                    {formatBytes(file.size)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            {model.reference} · generated {model.generatedAt}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

function Section({
  section,
  images,
}: {
  section: PdfSection;
  images: Record<string, string>;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.description ? (
        <Text style={styles.note}>{section.description}</Text>
      ) : null}
      {section.blocks.length === 0 ? (
        <Text style={styles.empty}>Nothing was recorded here.</Text>
      ) : (
        section.blocks.map((block, index) => (
          <Block key={index} block={block} images={images} />
        ))
      )}
    </View>
  );
}

function Block({
  block,
  images,
}: {
  block: PdfBlock;
  images: Record<string, string>;
}) {
  switch (block.kind) {
    case "heading":
      return <Text style={styles.sectionTitle}>{block.text}</Text>;

    case "paragraph":
      return <Text style={styles.note}>{block.text}</Text>;

    case "pairs":
      return (
        <View style={styles.table}>
          {block.rows.map((row, index) => (
            <View key={index} style={styles.row} wrap={false}>
              <Text style={[styles.cell, styles.labelCell]}>{row.label}</Text>
              <Text style={[styles.cell, styles.lastCell, styles.valueCell]}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      );

    case "table": {
      const width = `${100 / Math.max(block.columns.length, 1)}%`;
      return (
        <View>
          <Text style={styles.blockLabel}>{block.label}</Text>
          {block.rows.length === 0 ? (
            <Text style={styles.empty}>No entries.</Text>
          ) : (
            <View style={styles.table}>
              <View style={[styles.row, styles.headRow]} wrap={false}>
                {block.numbered ? (
                  <Text
                    style={[styles.cell, styles.indexCell, styles.headCell]}
                  >
                    SN
                  </Text>
                ) : null}
                {block.columns.map((column, index) => (
                  <Text
                    key={column + index}
                    style={[
                      styles.cell,
                      styles.headCell,
                      { width },
                      index === block.columns.length - 1 ? styles.lastCell : {},
                    ]}
                  >
                    {column}
                  </Text>
                ))}
              </View>
              {block.rows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row} wrap={false}>
                  {block.numbered ? (
                    <Text style={[styles.cell, styles.indexCell]}>
                      {rowIndex + 1}
                    </Text>
                  ) : null}
                  {row.map((cell, cellIndex) => (
                    <Text
                      key={cellIndex}
                      style={[
                        styles.cell,
                        { width },
                        cellIndex === row.length - 1 ? styles.lastCell : {},
                      ]}
                    >
                      {cell}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      );
    }

    case "attachments":
      return (
        <View>
          <Text style={styles.blockLabel}>{block.label}</Text>
          {block.files.length === 0 ? (
            <Text style={styles.empty}>Nothing was attached.</Text>
          ) : (
            block.files.map((file) => (
              <View key={file.id}>
                <View style={styles.attachment}>
                  <Text style={styles.attachmentName}>{file.name}</Text>
                  <Text style={styles.attachmentMeta}>
                    {formatBytes(file.size)}
                  </Text>
                </View>
                {images[file.id] ? (
                  // Not an <img>: this is the PDF renderer's own primitive,
                  // and a PDF has nowhere to put alternative text.
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={images[file.id]} style={styles.thumbnail} />
                ) : null}
              </View>
            ))
          )}
        </View>
      );
  }
}
