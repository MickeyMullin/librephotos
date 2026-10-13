import { Group, MultiSelect, SegmentedControl, Text, type ComboboxItem, type MultiSelectProps } from "@mantine/core";
import { IconTags as Tags } from "@tabler/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetchTagSearchQuery, useFetchTagsQuery } from "../../../api_client/tags/hooks";
import type { TagMatch } from "../../../api_client/tags/types";
import { validateMediaSearch, type MediaType } from "../../../components/photolist/mediaTypeFilter";
import type { EmptyStateConfig } from "../../../components/photolist/PhotoListView";
import { PhotoListView } from "../../../components/photolist/PhotoListView";
import { useMediaTypeFilter } from "../../../components/photolist/useMediaTypeFilter";
import { resolveTypedTag, TAG_SUGGESTION_LIMIT, tagOptionsFilter } from "../../../util/tagOptionsFilter";

type TagSearchRouteSearch = {
  media?: MediaType;
  // Comma-separated tag ids. Ids rather than names, so a bookmark survives a
  // rename. A "*" among them stands for "any tag" (see ANY_TAG).
  tags?: string;
  exclude?: string;
  // "all" is the default and stays out of the URL.
  match?: "any";
};

// TanStack Router JSON-parses search values, so a single id arrives as a
// number and several as the "1,2" string they were written as.
export function parseTagIds(value: unknown): number[] {
  const parts = typeof value === "number" ? [String(value)] : typeof value === "string" ? value.split(",") : [];
  const ids = parts.map(part => part.trim()).filter(part => /^\d+$/.test(part));
  return Array.from(new Set(ids.map(Number)));
}

// "*" in "Photos with these tags": the photo carries at least one tag, on top
// of whatever else is picked. On its own it is every tagged photo, and with
// exclusions every tagged photo without them (which "Without" alone cannot
// say: it keeps the untagged photos too).
export const ANY_TAG = "*";

export function parseAnyTag(value: unknown): boolean {
  return typeof value === "string" && value.split(",").some(part => part.trim() === ANY_TAG);
}

function tagsParam(anyTag: boolean, ids: number[]) {
  const parts = [...(anyTag ? [ANY_TAG] : []), ...ids.map(String)];
  return parts.length ? parts.join(",") : undefined;
}

export function validateTagSearch(search: Record<string, unknown>): TagSearchRouteSearch {
  const result: TagSearchRouteSearch = { ...validateMediaSearch(search) };
  const tags = tagsParam(parseAnyTag(search.tags), parseTagIds(search.tags));
  const exclude = parseTagIds(search.exclude);
  if (tags) result.tags = tags;
  if (exclude.length) result.exclude = exclude.join(",");
  if (search.match === "any") result.match = "any";
  return result;
}

export const Route = createFileRoute("/_protected/album/tags/search")({
  component: TagSearchPage,
  validateSearch: validateTagSearch,
});

type TagPickerProps = Omit<MultiSelectProps, "data" | "value" | "onChange"> & {
  data: ComboboxItem[];
  value: string[];
  onChange: (value: string[]) => void;
};

// A tag box where a comma finishes the tag typed so far, as in the tag editor.
// It watches the typed text rather than the key, so a phone keyboard (which
// may not report which key it was) and a pasted "beach, dog" work too. Only
// existing tags can be searched for: a name that matches none stays in the
// box, without the comma, to be corrected.
function TagPicker({ data, value, onChange, ...props }: TagPickerProps) {
  const [search, setSearch] = useState("");

  const handleSearchChange = (text: string) => {
    if (!text.includes(",")) {
      setSearch(text);
      return;
    }
    const parts = text.split(",");
    const rest = parts.pop() ?? "";
    const picked = [...value];
    let unmatched: string | undefined;
    parts.forEach(part => {
      const tag = resolveTypedTag(
        part,
        data.filter(option => !picked.includes(option.value))
      );
      if (tag) picked.push(tag.value);
      else if (part.trim()) unmatched = part.trim();
    });
    if (picked.length !== value.length) onChange(picked);
    setSearch(unmatched ?? rest.trimStart());
  };

  return (
    <MultiSelect
      {...props}
      data={data}
      value={value}
      onChange={onChange}
      searchable
      searchValue={search}
      onSearchChange={handleSearchChange}
      filter={tagOptionsFilter}
      limit={TAG_SUGGESTION_LIMIT}
      clearable
      hidePickedOptions
      // Keep iOS from capitalizing the first letter of a tag name.
      autoCapitalize="none"
    />
  );
}

// Search by tags: photos carrying all (or any) of the chosen tags, optionally
// without some others. The search lives in the URL, so it can be bookmarked.
function TagSearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const mediaType = useMediaTypeFilter();
  const { data: allTags } = useFetchTagsQuery();

  const tags = useMemo(() => parseTagIds(search.tags), [search.tags]);
  const anyTag = parseAnyTag(search.tags);
  const exclude = useMemo(() => parseTagIds(search.exclude), [search.exclude]);
  const match: TagMatch = search.match === "any" ? "any" : "all";
  const searching = tags.length > 0 || exclude.length > 0 || anyTag;

  const { data, isFetching } = useFetchTagSearchQuery({ tags, match, exclude, tagged: anyTag }, mediaType);

  const options = useMemo(() => (allTags ?? []).map(tag => ({ value: String(tag.id), label: tag.name })), [allTags]);
  // A tag picked on one side is not offered on the other. "*" comes first,
  // and only on the "with" side.
  const includeOptions = [
    { value: ANY_TAG, label: ANY_TAG },
    ...options.filter(option => !exclude.includes(Number(option.value))),
  ];
  const excludeOptions = options.filter(option => !tags.includes(Number(option.value)));

  const update = (patch: Partial<{ tags: number[]; tagged: boolean; exclude: number[]; match: TagMatch }>) => {
    const next = { tags, tagged: anyTag, exclude, match, ...patch };
    navigate({
      to: "/album/tags/search",
      search: prev => ({
        ...prev,
        tags: tagsParam(next.tagged, next.tags),
        exclude: next.exclude.length ? next.exclude.join(",") : undefined,
        match: next.match === "any" ? ("any" as const) : undefined,
      }),
      // Back leaves the search rather than stepping through every tag picked.
      replace: true,
    });
  };

  const emptyStateConfig: EmptyStateConfig = useMemo(
    () =>
      searching
        ? {
            icon: <Tags size={40} />,
            title: t("tagsearch.nomatch.title"),
            description: t("tagsearch.nomatch.description"),
          }
        : {
            icon: <Tags size={40} />,
            title: t("tagsearch.start.title"),
            description: t("tagsearch.start.description"),
          },
    [searching, t]
  );

  const controls = (
    <Group gap="xs" mt={6} wrap="wrap" align="center" onClick={event => event.stopPropagation()}>
      <TagPicker
        aria-label={t("tagsearch.with")}
        placeholder={tags.length || anyTag ? undefined : t("tagsearch.with")}
        data={includeOptions}
        value={[...(anyTag ? [ANY_TAG] : []), ...tags.map(String)]}
        onChange={values =>
          update({
            tagged: values.includes(ANY_TAG),
            tags: values.filter(value => value !== ANY_TAG).map(Number),
          })
        }
        // The pill shows just "*"; the suggestion says what it means.
        renderOption={({ option }) =>
          option.value === ANY_TAG ? (
            <Group gap="xs" wrap="nowrap">
              <Text size="sm">{ANY_TAG}</Text>
              <Text size="xs" c="dimmed">
                {t("tagsearch.anytag")}
              </Text>
            </Group>
          ) : (
            option.label
          )
        }
        nothingFoundMessage={t("tagsearch.notag")}
        w={{ base: "100%", sm: 320 }}
      />
      {tags.length > 1 && (
        <SegmentedControl
          size="xs"
          aria-label={t("tagsearch.match")}
          value={match}
          onChange={value => update({ match: value as TagMatch })}
          data={[
            { value: "all", label: t("tagsearch.all") },
            { value: "any", label: t("tagsearch.any") },
          ]}
        />
      )}
      <TagPicker
        aria-label={t("tagsearch.without")}
        placeholder={exclude.length ? undefined : t("tagsearch.without")}
        data={excludeOptions}
        value={exclude.map(String)}
        onChange={values => update({ exclude: values.map(Number) })}
        nothingFoundMessage={t("tagsearch.notag")}
        w={{ base: "100%", sm: 240 }}
      />
    </Group>
  );

  const photoset = searching && data ? data.grouped_photos : [];
  return (
    <PhotoListView
      title={t("tagsearch.title")}
      loading={searching && isFetching && !data}
      icon={<Tags size={50} />}
      photoset={photoset}
      idx2hash={photoset.flatMap(group => group.items)}
      mediaType={mediaType}
      additionalSubHeader={controls}
      emptyStateConfig={emptyStateConfig}
      selectable
    />
  );
}
