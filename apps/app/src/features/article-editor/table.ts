import type { Node } from 'prosemirror-model';
import { Selection, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { schema } from './markdown';

export function activeCell(state: EditorState) {
  const { $from } = state.selection;
  if (!['table_header', 'table_cell'].includes($from.parent.type.name)) return null;
  return {
    table: $from.node(-2),
    pos: $from.before($from.depth - 2),
    row: $from.index(-2),
    col: $from.index(-1),
  };
}
function cellPos(table: Node, start: number, row: number, col: number) {
  let pos = start + 3;
  for (let i = 0; i < row; i++) pos += table.child(i).nodeSize;
  for (let i = 0; i < col; i++) pos += table.child(row).child(i).nodeSize;
  return pos;
}
export const leaveTable: Command = (state, dispatch) => {
  const active = activeCell(state);
  if (!active) return false;
  const end = active.pos + active.table.nodeSize;
  const tr = state.tr;
  let next = Selection.findFrom(tr.doc.resolve(end), 1, true);
  if (!next) {
    tr.insert(end, schema.nodes.paragraph!.create());
    next = TextSelection.create(tr.doc, end + 1);
  }
  dispatch?.(tr.setSelection(next).scrollIntoView());
  return true;
};
type TableAction = 'addRow' | 'addColumn' | 'deleteRow' | 'deleteColumn';
export function editTable(action: TableAction): Command {
  return (state, dispatch) => {
    const active = activeCell(state);
    if (!active) return false;
    const { table, pos, row, col } = active,
      height = table.childCount,
      width = table.firstChild!.childCount;
    if (
      (action === 'deleteRow' && (height === 1 || row === 0)) ||
      (action === 'deleteColumn' && width === 1)
    )
      return false;
    if (!dispatch) return true;
    const rows: Node[] = [];
    table.forEach((old, _, r) => {
      if (action === 'deleteRow' && row === r) return;
      const cells: Node[] = [];
      old.forEach((c, __, i) => {
        if (action !== 'deleteColumn' || i !== col) cells.push(c);
        if (action === 'addColumn' && i === col) cells.push(c.type.create(c.attrs));
      });
      rows.push(old.type.create(old.attrs, cells));
      if (action === 'addRow' && r === row)
        rows.push(
          old.type.create(
            null,
            Array.from({ length: width }, () => schema.nodes.table_cell!.create()),
          ),
        );
    });
    const next = table.type.create(table.attrs, rows),
      tr = state.tr.replaceWith(pos, pos + table.nodeSize, next);
    const newRow = Math.min(row + Number(action === 'addRow'), next.childCount - 1);
    const newCol = Math.min(
      col + Number(action === 'addColumn'),
      next.child(newRow).childCount - 1,
    );
    dispatch(
      tr
        .setSelection(TextSelection.create(tr.doc, cellPos(next, pos, newRow, newCol)))
        .scrollIntoView(),
    );
    return true;
  };
}
export function navigateCell(direction: 'next' | 'previous' | 'down'): Command {
  return (state, dispatch) => {
    const active = activeCell(state);
    if (!active) return false;
    const { table, pos, row, col } = active,
      width = table.child(row).childCount;
    let r = row,
      c = col;
    if (direction === 'down') r++;
    else if (direction === 'next') {
      c++;
      if (c === width) {
        c = 0;
        r++;
      }
    } else {
      c--;
      if (c < 0) {
        r--;
        c = r >= 0 ? table.child(r).childCount - 1 : 0;
      }
    }
    if (r < 0) return false;
    if (r >= table.childCount) {
      return editTable('addRow')(state, (tr) => {
        if (direction === 'next')
          tr.setSelection(TextSelection.create(tr.doc, cellPos(tr.doc.nodeAt(pos)!, pos, r, 0)));
        dispatch?.(tr);
      });
    }
    dispatch?.(
      state.tr
        .setSelection(
          TextSelection.create(
            state.doc,
            cellPos(table, pos, r, Math.min(c, table.child(r).childCount - 1)),
          ),
        )
        .scrollIntoView(),
    );
    return true;
  };
}
