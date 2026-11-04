# Studioodle

A free drawing and coloring studio. This public repository contains the shared
application source for browser, Windows and Android, plus official build entry
helpers. It is also the home for future web publishing and downloadable releases.

## Source and assets

The application code is available under [Apache 2.0](LICENSE). Official artwork,
sticker/page libraries, logo artwork and branding implementations are supplied
separately by the private official project and are not included or licensed here.
Third-party components retain their own licenses. Apache 2.0 grants no general
permission to use Studioodle trademarks to identify an unofficial edition.

The src/ui/Brand.tsx adapter delegates to a host-supplied branding implementation.
Asset consumers use @studioodle-assets; background styling uses
@studioodle-backgrounds. Generated sticker identifier types are code, not the
underlying artwork. No private Git history was imported into this repository.

## Official development and builds

The official project checks this repository out as its app/ Git submodule. The
private host owns dependency installation, Vite configuration, website, native
hosts, tests and private asset providers. Maintained private helpers live under
dev/scripts/, regressions under dev/tests/, and the isolated artwork reviewer
under dev/artwork-review/. Scratch output and downloaded tools are ignored under
dev/work/ and dev/bin/. From that authorized parent checkout:

    git submodule update --init app
    npm ci
    npm run dev
    npm run web
    npm run web:build

Official output is grouped under the private parent's ignored dist/: app/ for
the app-only frontend, web/ for the website, and releases/android/ or
releases/windows/ for native packages. Builds clear only their own app/web output.

Run one dev server command at a time, or choose separate ports. The public repo's
npm run dev, web, build, web:build, typecheck and check commands delegate to that
same parent. STUDIOODLE_PRIVATE_ROOT can identify its absolute location; it must
contain this checkout at app/. No secret is embedded in those commands.

A public-only clone contains source but cannot currently build the official
edition: it lacks the artwork catalogs, page layouts, branding and host setup.
A standalone sample asset provider is not included yet. A public hosting job
cannot access the private repository without separately configured owner access.
For now, build from the authorized private parent with this submodule initialized;
only the reviewed static output should be deployed to a static web server.

## Website and releases

The intended website is https://studioodle.com. No hosting, DNS, installer or
store listing is configured by this source move. Browser launch/download links
will be added as releases become available. Downloadable packages will use the
[Releases page](https://github.com/abflett/Studioodle-public/releases), rather than
committing installers into the source tree. Release artifacts will carry their
applicable artwork/end-user terms and third-party notices separately.
