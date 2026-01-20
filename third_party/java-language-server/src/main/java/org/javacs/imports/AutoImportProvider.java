package org.javacs.imports;

import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.util.SourcePositions;
import java.util.Comparator;
import java.util.List;
import org.javacs.lsp.TextEdit;

/**
 * Provides the functionality to auto-import classes.
 */
public interface AutoImportProvider {
    /**
     * Computes edits to add an import statement of the given class name to the Java file.
     */
    List<TextEdit> addImport(String className, CompilationUnitTree root, SourcePositions sourcePositions);

    /**
     * Returns a comparator that sorts imports.
     */
    default Comparator<String> importComparator() {
        return String::compareTo;
    }

    /**
     * Returns the section number for the given import.
     */
    default int getImportSection(String className) {
        return 0;
    }
}
