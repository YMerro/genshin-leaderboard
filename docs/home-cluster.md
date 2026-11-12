# Run on a home Kubernetes cluster, reachable from the internet

This sets up the leaderboard on **your own PC** in a small Kubernetes cluster (k3d, which runs k3s inside Docker) and publishes it with **Tailscale Funnel** at a fixed address:

```
https://leaderboard.<your-tailnet>.ts.net
```

The address never changes, HTTPS is automatic, you don't need a domain, you don't open any ports on your router, and your home IP stays hidden. Tailscale's free Personal plan is enough.

> Only do this on a PC and network you own. Not on a work computer.

```
Internet ──HTTPS──▶ Tailscale Funnel ◀──outbound── Tailscale proxy pod ──▶ leaderboard pod ──▶ data volume
                                                    (made by the operator)   backup CronJob ──▶ backups volume (nightly)
```

What gets deployed:

| Resource | Purpose |
|---|---|
| Tailscale operator (Helm, namespace `tailscale`) | Watches Ingresses with class `tailscale` and creates the proxy that publishes them |
| `Deployment/leaderboard` + `Service` + `PVC leaderboard-data` (1 Gi) | The app and its data |
| `Ingress/leaderboard` (class `tailscale`, Funnel on) | Publishes the app at `leaderboard.<tailnet>.ts.net` |
| `CronJob/leaderboard-backup` + `PVC leaderboard-backups` (2 Gi) | Archive of `/data` every night at 03:30, last 14 kept |
| Secret `leaderboard-admin` | Admin password, created by you, never stored in git |

The last four are in `deploy/k8s/overlays/home`.

---

## 1. Requirements

| Need | Notes |
|---|---|
| Windows 10/11 PC you own, with admin rights | Virtualization enabled in BIOS (usually is). Linux works too, see the end. |
| ~4 GB free RAM, ~5 GB disk | The app uses about 400 MB |
| Free Tailscale account | https://login.tailscale.com/start (sign in with Google, GitHub or Microsoft) |
| PC switched on | When it sleeps or shuts down, the site is offline |

## 2. Install the tools

In an **admin** PowerShell:

```powershell
wsl --install                       # reboot if asked
winget install Docker.DockerDesktop
winget install Kubernetes.kubectl k3d.k3d Helm.Helm Git.Git
```

Start **Docker Desktop**, then in its Settings:
- General: **Use the WSL 2 based engine** on, **Start Docker Desktop when you sign in** on.
- Leave its own Kubernetes option **off** (k3d is used instead).

In Windows power settings, set **Sleep: Never** when plugged in, otherwise the site goes down when the PC sleeps.

Open a new PowerShell (so the new tools are on PATH) and check:
```powershell
docker version
k3d version
kubectl version --client
helm version
```

## 3. Prepare Tailscale

All in the admin console, https://login.tailscale.com/admin.

1. **DNS** page:
   - **MagicDNS**: on (it is by default).
   - **HTTPS Certificates**: click **Enable HTTPS**.
   - Note your **tailnet DNS name** at the top, like `tail1a2b3c.ts.net`. Your site will be `https://leaderboard.tail1a2b3c.ts.net`. (You can pick a nicer one once with **Rename tailnet…**; do it now, before anything is published.)

2. **Access controls** page (the policy file): add these entries and **Save**. If a section already exists, merge into it instead of adding a second one.
   ```jsonc
   "tagOwners": {
     "tag:k8s-operator": [],
     "tag:k8s": ["tag:k8s-operator"],
   },
   "nodeAttrs": [
     {
       // allows the cluster's proxies to use Funnel (public internet access)
       "target": ["tag:k8s"],
       "attr":   ["funnel"],
     },
   ],
   ```

3. **Settings → Trust credentials → Credential → OAuth** (called *OAuth clients* in older consoles):
   - Scopes: **Devices → Core: Write**, **Keys → Auth Keys: Write**, and **Services: Write** if it's listed.
   - Tag for each scope: `tag:k8s-operator`.
   - **Generate**, then copy the **Client ID** and **Client secret**. The secret is shown only once.

## 4. Create the cluster

```powershell
k3d cluster create home --agents 0 --servers 1 --k3s-arg "--disable=traefik@server:0"
kubectl get nodes
```
The node should be `Ready`. Traefik is disabled because Tailscale publishes the app instead.

The cluster restarts with Docker Desktop, so it comes back after a reboot on its own.

## 5. Install the Tailscale operator

```powershell
helm repo add tailscale https://pkgs.tailscale.com/helmcharts
helm repo update
helm upgrade --install tailscale-operator tailscale/tailscale-operator `
  --namespace tailscale --create-namespace `
  --set-string oauth.clientId='<client id>' `
  --set-string oauth.clientSecret='<client secret>' `
  --wait
kubectl -n tailscale get pods
```
The `operator-…` pod should be `Running`, and a machine named `tailscale-operator` should appear on the **Machines** page of the admin console.

## 6. Make the app image pullable

The image `ghcr.io/ymerro/genshin-leaderboard` is built by CI. Either:

- **Make it public** (easiest): GitHub → profile → **Packages** → genshin-leaderboard → **Package settings** → **Change visibility → Public**.
- Or keep it private and give the cluster a token (GitHub → Settings → Developer settings → Personal access tokens → classic, scope `read:packages`):
  ```powershell
  kubectl create namespace leaderboard
  kubectl -n leaderboard create secret docker-registry ghcr --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token>
  kubectl -n leaderboard patch serviceaccount default -p '{\"imagePullSecrets\":[{\"name\":\"ghcr\"}]}'
  ```

## 7. Deploy

```powershell
git clone https://github.com/YMerro/genshin-leaderboard
cd genshin-leaderboard

kubectl create namespace leaderboard
kubectl -n leaderboard create secret generic leaderboard-admin --from-literal=password='<a long admin password>'

kubectl apply -k deploy/k8s/overlays/home
kubectl -n leaderboard rollout status deploy/leaderboard --timeout=5m
kubectl -n leaderboard get pods,ingress
```

- The `leaderboard-…` pod should be `Running` and `1/1`. (An "already exists" error for the namespace is fine.)
- After a minute or so, the Ingress **ADDRESS** column shows `leaderboard.<tailnet>.ts.net`, and a machine named `leaderboard` appears in the Tailscale admin console.

Pick a strong admin password (20+ random characters): the site is public and anyone can try it. After 20 wrong tries in 10 minutes admin actions lock for 10 minutes.

## 8. Check it

Open `https://leaderboard.<tailnet>.ts.net` from any device, even one **not** on Tailscale (for example your phone on mobile data). The very first visit can take up to a minute while the HTTPS certificate is issued.

Then click **Admin**, enter the password and add the players.

Local access without the internet:
```powershell
kubectl -n leaderboard port-forward svc/leaderboard 8081:80    # http://localhost:8081, Ctrl+C to end
```

## 9. Move your existing data (optional)

To bring over friends, history and wishes from the Windows install (`%USERPROFILE%\GenshinLeaderboard\data`):

```powershell
$pod = (kubectl -n leaderboard get pod -l app.kubernetes.io/name=genshin-leaderboard -o name) -replace 'pod/', ''
cd $env:USERPROFILE\GenshinLeaderboard\data
kubectl -n leaderboard cp friends.json ${pod}:/data/friends.json
kubectl -n leaderboard cp history ${pod}:/data/history
kubectl -n leaderboard cp wishes ${pod}:/data/wishes
kubectl -n leaderboard rollout restart deploy/leaderboard
```
(Skip any folder that doesn't exist.)

---

## Day to day

| Task | Command |
|---|---|
| Status | `kubectl -n leaderboard get pods,ingress` |
| App logs | `kubectl -n leaderboard logs deploy/leaderboard -f` |
| Update to the newest version (after a push to `main` and green CI) | `kubectl -n leaderboard rollout restart deploy/leaderboard` |
| Apply changed manifests | `git pull` then `kubectl apply -k deploy/k8s/overlays/home` |
| Change admin password | `kubectl -n leaderboard create secret generic leaderboard-admin --from-literal=password='<new>' --dry-run=client -o yaml \| kubectl apply -f -` then `kubectl -n leaderboard rollout restart deploy/leaderboard` |
| Take it off the internet but keep it on your own Tailscale devices | `kubectl -n leaderboard annotate ingress leaderboard tailscale.com/funnel-` (back: `... tailscale.com/funnel=true`) |
| Take the site offline completely (keep data) | `kubectl -n leaderboard delete ingress leaderboard` (back: `kubectl apply -k deploy/k8s/overlays/home`). The address stays the same when it comes back. |
| Stop everything (keep data) | `k3d cluster stop home` (back: `k3d cluster start home`) |
| Update the Tailscale operator | `helm repo update` then the `helm upgrade` command from step 5 |

The address stays the same as long as the `leaderboard` machine keeps that name in Tailscale. If you ever delete the cluster and the machine still exists in the admin console, delete the old machine first, or the new one gets named `leaderboard-1`.

### Backups

Run one now and list them:
```powershell
kubectl -n leaderboard create job --from=cronjob/leaderboard-backup backup-now
kubectl -n leaderboard logs job/backup-now
kubectl -n leaderboard run ls --rm -it --restart=Never --image=busybox:1.37 --overrides='{\"spec\":{\"volumes\":[{\"name\":\"b\",\"persistentVolumeClaim\":{\"claimName\":\"leaderboard-backups\"}}],\"containers\":[{\"name\":\"ls\",\"image\":\"busybox:1.37\",\"command\":[\"ls\",\"-lh\",\"/b\"],\"volumeMounts\":[{\"name\":\"b\",\"mountPath\":\"/b\"}]}]}}'
```

The backups volume is on the same PC. For a copy elsewhere, pull the data out now and then:
```powershell
kubectl -n leaderboard cp ${pod}:/data .\leaderboard-data-copy
```

Restore: copy files back into `/data` with `kubectl cp` as in step 9, then `rollout restart`.

### Remove everything

```powershell
kubectl delete -k deploy/k8s/overlays/home     # deletes the data volumes too: back up first
helm uninstall tailscale-operator -n tailscale
k3d cluster delete home
```
Then remove the `leaderboard` and `tailscale-operator` machines and the OAuth client in the Tailscale admin console.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| App pod `ImagePullBackOff` | Step 6: the image is private. `kubectl -n leaderboard describe pod <name>` |
| Operator pod not running | `kubectl -n tailscale logs deploy/operator`. Usually a wrong OAuth client ID/secret, missing scopes, or the `tagOwners` entry from step 3 is missing |
| Ingress has no ADDRESS | `kubectl -n tailscale get pods` should show a `ts-leaderboard-…` proxy pod. Check its logs and the operator's logs |
| Works on your Tailscale devices but not from the internet | The `funnel` nodeAttr for `tag:k8s` (step 3) is missing, or HTTPS certificates aren't enabled. Fix it, then delete and re-apply the Ingress |
| Certificate or "connection reset" on first visit | Wait a minute: the certificate is being issued |
| Admin button says admin is disabled | `leaderboard-admin` secret missing or created after the pod: `kubectl -n leaderboard rollout restart deploy/leaderboard` |
| Site down after reboot | Docker Desktop must be running; `k3d cluster list` then `k3d cluster start home` |

## On Linux instead of Windows

Skip Docker Desktop and k3d, and install k3s directly:
```bash
curl -sfL https://get.k3s.io | sh -s - --disable traefik
mkdir -p ~/.kube && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config && sudo chown $USER ~/.kube/config
kubectl get nodes
```
Install Helm (`curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash`), then follow steps 3 and 5 to 9 the same way (use `\` instead of `` ` `` for line breaks). k3s starts at boot as a system service.
