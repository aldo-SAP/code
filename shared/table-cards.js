/* Tables on phones (see table-cards.css): gives every cell of a table with a header row its column heading, so that on a
   small screen the row can show "heading + value" as a card and nothing needs sideways scrolling. Tables rebuilt later
   (rows added, language changed) are picked up automatically. Tables of class "tot" (key / value lists) are left alone. */
(function () {
  function labelCells(tbl) {
    var hr = tbl.tHead && tbl.tHead.rows[tbl.tHead.rows.length - 1];
    if (!hr) return;
    var heads = Array.prototype.slice.call(hr.cells);
    // only this table's own body / footer rows, not the rows of a table nested inside one of its cells
    Array.prototype.forEach.call(tbl.rows, function (tr) {
      if (tr.parentElement.tagName === "THEAD") return;
      var col = 0;
      Array.prototype.forEach.call(tr.cells, function (td) {
        var th = heads[col];
        col += td.colSpan || 1;
        if (!th || td.colSpan > 1 || td.querySelector(":scope > .dl")) return;   // spanning cells (detail / error rows) get no heading
        var label = th.textContent.trim();
        if ((td.textContent.trim() === "" && !td.children.length) || !label || label === "#") return;
        var dl = document.createElement("span"), dv = document.createElement("span");
        dl.className = "dl"; dl.innerHTML = th.innerHTML;
        dv.className = "dv";
        while (td.firstChild) dv.appendChild(td.firstChild);   // the cell's own content, kept as one block
        td.appendChild(dl); td.appendChild(dv);
      });
    });
  }
  function run() {
    Array.prototype.forEach.call(document.querySelectorAll("table"), function (tbl) {
      if (!tbl.tHead || tbl.classList.contains("tot")) return;
      tbl.classList.add("tc");
      labelCells(tbl);
    });
  }
  var timer = 0;
  new MutationObserver(function () { cancelAnimationFrame(timer); timer = requestAnimationFrame(run); })
    .observe(document.body, { childList: true, subtree: true });
  run();
})();
