package org.javacs.rewrite;

import com.sun.source.util.Trees;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.logging.Logger;
import org.javacs.CompileTask;
import org.javacs.CompilerProvider;
import org.javacs.lsp.Position;
import org.javacs.lsp.Range;
import org.javacs.lsp.TextEdit;

public class AutoFixImports implements Rewrite {
    final Path file;
    final org.javacs.imports.AutoImportProvider provider;

    public AutoFixImports(Path file) {
        this(file, org.javacs.imports.SimpleAutoImportProvider.INSTANCE);
    }

    public AutoFixImports(Path file, org.javacs.imports.AutoImportProvider provider) {
        this.file = file;
        this.provider = provider;
    }

    @Override
    public Map<Path, TextEdit[]> rewrite(CompilerProvider compiler) {
        LOG.info("Fix imports in " + file + "...");
        try (var task = compiler.compile(file)) {
            var existing = new HashSet<String>();
            var root = task.root();
            for (var i : root.getImports()) {
                var name = i.getQualifiedIdentifier().toString();
                if (i.isStatic()) {
                    existing.add("static " + name);
                } else {
                    existing.add(name);
                }
            }

            var used = usedImports(task);
            var unresolved = unresolvedNames(task);
            var resolved = resolveNames(compiler, unresolved);

            var all = new HashSet<String>();
            all.addAll(existing);
            all.addAll(used);
            all.addAll(resolved.values());

            var sorted = new ArrayList<>(all);
            sorted.sort(provider.importComparator());

            return Map.of(file, new TextEdit[] { replaceImports(task, sorted) });
        }
    }

    private Set<String> usedImports(CompileTask task) {
        var used = new HashSet<String>();
        new FindUsedImports(task.task).scan(task.root(), used);
        return used;
    }

    private Set<String> unresolvedNames(CompileTask task) {
        var names = new HashSet<String>();
        for (var d : task.diagnostics) {
            if (!d.getCode().equals("compiler.err.cant.resolve.location")) continue;
            if (!d.getSource().toUri().equals(file.toUri())) continue;
            var start = (int) d.getStartPosition();
            var end = (int) d.getEndPosition();
            CharSequence contents;
            try {
                contents = d.getSource().getCharContent(true);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            var name = contents.subSequence(start, end).toString();
            if (!name.matches("[A-Z]\\w+")) continue;
            names.add(name);
        }
        return names;
    }

    private Map<String, String> resolveNames(CompilerProvider compiler, Set<String> unresolved) {
        var resolved = new HashMap<String, String>();
        var alreadyImported = compiler.imports();
        for (var className : unresolved) {
            var candidates = new ArrayList<String>();
            for (var i : alreadyImported) {
                if (i.endsWith("." + className)) {
                    candidates.add(i);
                }
            }
            if (candidates.isEmpty()) continue;
            if (candidates.size() > 1) {
                LOG.warning("..." + className + " is ambiguous between " + String.join(", ", candidates));
                continue;
            }
            LOG.info("...resolve " + className + " to " + candidates.get(0));
            resolved.put(className, candidates.get(0));
        }
        // TODO import my own classes
        return resolved;
    }

    private TextEdit replaceImports(CompileTask task, List<String> qualifiedNames) {
        var root = task.root();
        var pos = Trees.instance(task.task).getSourcePositions();
        var imports = root.getImports();

        long start = -1;
        long end = -1;

        // Find span of existing imports
        if (!imports.isEmpty()) {
            start = pos.getStartPosition(root, imports.get(0));
            end = pos.getEndPosition(root, imports.get(imports.size() - 1));
            // Replace the entire block of imports, from the start of the first valid line
            // to the start of the line after the last import.
            long startLine = root.getLineMap().getLineNumber(start);
            start = root.getLineMap().getPosition(startLine, 1);

            long endLine = root.getLineMap().getLineNumber(end);
            // We want to consume the newline after the last import.
            // Just replacing up to 'end' leaves the newline.
            // Let's rely on the formatted text having a newline at the end.
            end = root.getLineMap().getPosition(endLine + 1, 1);
        } else {
            // No existing imports. Insert after package or at top.
            if (root.getPackage() != null) {
                end = pos.getEndPosition(root, root.getPackage());
                long line = root.getLineMap().getLineNumber(end);
                // Insert after package line
                start = root.getLineMap().getPosition(line + 1, 1);
                end = start;
            } else {
                // No package. Insert before the first type declaration if it exists.
                // This avoids inserting before the license header.
                var types = root.getTypeDecls();
                if (!types.isEmpty()) {
                    start = pos.getStartPosition(root, types.get(0));
                    long line = root.getLineMap().getLineNumber(start);
                    start = root.getLineMap().getPosition(line, 1);
                    end = start;
                } else {
                    start = 0;
                    end = 0;
                }
            }
        }

        var text = new StringBuilder();
        var groups = new TreeMap<Integer, List<String>>();
        for (var i : qualifiedNames) {
            var section = provider.getImportSection(i);
            groups.computeIfAbsent(section, k -> new ArrayList<>()).add(i);
        }
        for (var group : groups.values()) {
            group.sort(String::compareTo);
        }
        boolean first = true;
        for (var group : groups.values()) {
            if (!first) text.append("\n");
            for (var i : group) {
                text.append("import ").append(i).append(";\n");
            }
            first = false;
        }

        // Create the range.
        // Convert stream positions to (line, character) for LSP Range.
        // LineMap uses 1-based lines. LSP uses 0-based.
        var startLsp = toLspPosition(task, start);
        var endLsp = toLspPosition(task, end);

        return new TextEdit(new Range(startLsp, endLsp), text.toString());
    }

    private Position toLspPosition(CompileTask task, long offset) {
        var root = task.root();
        var line = (int) root.getLineMap().getLineNumber(offset);
        var col = (int) root.getLineMap().getColumnNumber(offset);
        return new Position(line - 1, col - 1);
    }

    private static final Logger LOG = Logger.getLogger("main");
}
