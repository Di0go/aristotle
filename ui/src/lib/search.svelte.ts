// Whether the search palette is open: Ctrl+K or / anywhere, the ribbon's search button, or "Search" on selected text.

class SearchBox {
  open = $state(false);
  /** Text to search for on opening (the context menu's "Search"), taken by the palette once. */
  seed = $state<string | null>(null);

  toggle(value = !this.open, query?: string) {
    if (query) this.seed = query;
    this.open = value;
  }
}

export const searchBox = new SearchBox();
