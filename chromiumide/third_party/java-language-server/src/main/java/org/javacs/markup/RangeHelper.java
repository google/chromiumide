package org.javacs.markup;

import com.sun.source.tree.CompilationUnitTree;
import org.javacs.lsp.Position;
import org.javacs.lsp.Range;

class RangeHelper {
    static Range range(CompilationUnitTree root, long start, long end) {
        var lines = root.getLineMap();
        var startLine = (int) lines.getLineNumber(start);
        var startColumn = (int) lines.getColumnNumber(start);
        var startPos = new Position(startLine - 1, startColumn - 1);
        var endLine = (int) lines.getLineNumber(end);
        var endColumn = (int) lines.getColumnNumber(end);
        var endPos = new Position(endLine - 1, endColumn - 1);
        return new Range(startPos, endPos);
    }
}
