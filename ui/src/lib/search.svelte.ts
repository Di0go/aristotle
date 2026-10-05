// Whether the search palette is open: Ctrl+K or / anywhere, or the ribbon's search button.

class SearchBox {
  open = $state(false);

  toggle(value = !this.open) {
    this.open = value;
  }
}

export const searchBox = new SearchBox();
