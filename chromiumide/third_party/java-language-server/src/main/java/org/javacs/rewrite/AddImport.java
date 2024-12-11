package org.javacs.rewrite;

import com.sun.source.tree.*;
import com.sun.source.util.Trees;
import java.nio.file.Path;
import java.util.Map;
import org.javacs.CompilerProvider;
import org.javacs.ParseTask;
import org.javacs.lsp.Position;
import org.javacs.lsp.Range;
import org.javacs.lsp.TextEdit;

public class AddImport implements Rewrite {
    final Path file;
    final String className;

    public AddImport(Path file, String className) {
        this.file = file;
        this.className = className;
    }

    @Override
    public Map<Path, TextEdit[]> rewrite(CompilerProvider compiler) {
        var task = compiler.parse(file);
        var point = insertPosition(task);
        var text = "import " + className + ";\n";
        TextEdit[] edits = {new TextEdit(new Range(point, point), text)};
        return Map.of(file, edits);
    }

    private Position insertPosition(ParseTask task) {
        var imports = task.root.getImports();
        for (var i : imports) {
            var next = i.getQualifiedIdentifier().toString();
            if (className.compareTo(next) < 0) {
                return insertBefore(task, i);
            }
        }
        if (!imports.isEmpty()) {
            var last = imports.get(imports.size() - 1);
            return insertAfter(task, last);
        }
        if (task.root.getPackage() != null) {
            return insertAfter(task, task.root.getPackage());
        }
        return new Position(0, 0);
    }

    private Position insertBefore(ParseTask task, Tree i) {
        var pos = Trees.instance(task.task).getSourcePositions();
        var offset = pos.getStartPosition(task.root, i);
        var line = (int) task.root.getLineMap().getLineNumber(offset);
        return new Position(line - 1, 0);
    }

    private Position insertAfter(ParseTask task, Tree i) {
        var pos = Trees.instance(task.task).getSourcePositions();
        var offset = pos.getStartPosition(task.root, i);
        var line = (int) task.root.getLineMap().getLineNumber(offset);
        return new Position(line, 0);
    }
}
