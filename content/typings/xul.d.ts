namespace XUL {
  class Element extends HTMLElement {
    public hidden: boolean
    public getAttribute(name: string): string
    public setAttribute(name: string, value: string): void
  }

  class Textbox extends XUL.Element {
    public value: string
    public readonly: boolean
  }

  class Checkbox extends XUL.Element {
    public checked: boolean
  }

  class Menuitem extends XUL.Element {
    public value: string
    public label: string
  }

  class Menupopup extends XUL.Element {
    public children: Menuitem[]
  }

  class Menulist extends XUL.Element {
    public firstChild: Menupopup
    public selectedItem: Menuitem
    public value: string
  }
}
